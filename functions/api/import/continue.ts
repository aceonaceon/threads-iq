// POST /api/import/continue - Continue importing posts (Phase A partial or Phase B)
// Optimized: batch D1 inserts, skip per-post insights
import { Env, verifyToken, getAuthToken, getCorsHeaders, handleOptions } from './_shared';

function isApproachingTimeout(startTime: number, threshold = 20000): boolean {
  return Date.now() - startTime > threshold;
}

export const onRequestPost: PagesFunction<Env> = async (context): Promise<Response> => {
  const optionsResponse = await handleOptions(context.request);
  if (optionsResponse) return optionsResponse;
  
  const headers = getCorsHeaders();
  const startTime = Date.now();
  
  try {
    const token = getAuthToken(context.request);
    if (!token) {
      return new Response(JSON.stringify({ error: '未登入' }), { status: 401, headers });
    }
    
    const payload = await verifyToken(token, context.env.LINE_CHANNEL_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers });
    }
    
    const lineUserId = payload.sub;
    
    // Find active import job with cursor
    const job = await context.env.THREADSIQ_DB.prepare(
      `SELECT * FROM import_jobs 
       WHERE user_id = ? AND status IN ('phase_a', 'phase_b', 'paused') AND cursor IS NOT NULL AND cursor != ''
       ORDER BY started_at DESC LIMIT 1`
    ).bind(lineUserId).first<any>();
    
    if (!job) {
      const completedJob = await context.env.THREADSIQ_DB.prepare(
        `SELECT * FROM import_jobs WHERE user_id = ? AND status = 'completed' ORDER BY started_at DESC LIMIT 1`
      ).bind(lineUserId).first<any>();
      
      if (completedJob) {
        return new Response(JSON.stringify({
          status: 'completed',
          total_fetched: completedJob.total_fetched,
          message: 'Import already completed',
        }), { status: 200, headers });
      }
      
      return new Response(JSON.stringify({ error: 'no_active_import' }), { status: 400, headers });
    }
    
    // Check if rate limited
    if (job.status === 'paused' && job.rate_limit_paused_until) {
      const pauseUntil = new Date(job.rate_limit_paused_until);
      if (pauseUntil > new Date()) {
        return new Response(JSON.stringify({
          status: 'paused',
          resumeAt: job.rate_limit_paused_until,
          message: `Rate limited until ${job.rate_limit_paused_until}`,
        }), { status: 200, headers });
      }
      await context.env.THREADSIQ_DB.prepare(
        `UPDATE import_jobs SET status = ? WHERE id = ?`
      ).bind(job.phase === 'a' ? 'phase_a' : 'phase_b', job.id).run();
    }
    
    // Get Threads token
    const tokenStr = await context.env.THREADSIQ_STORE.get(`threads_token:${lineUserId}`);
    if (!tokenStr) {
      return new Response(JSON.stringify({ error: 'threads_not_connected' }), { status: 400, headers });
    }
    
    const tokenData = JSON.parse(tokenStr);
    const accessToken = tokenData.accessToken;
    
    const isPhaseA = job.phase === 'a' && !job.phase_a_completed_at;
    const targetPosts = job.target_posts || 300;
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    let cursor = job.cursor || undefined;
    let postsFetched = job.total_fetched || 0;
    let hasMore = true;
    let phaseComplete = false;
    
    while (hasMore && !isApproachingTimeout(startTime)) {
      const postsUrl = new URL('https://graph.threads.net/v1.0/me/threads');
      postsUrl.searchParams.set('fields', 'id,text,timestamp,media_type,media_url,permalink');
      postsUrl.searchParams.set('access_token', accessToken);
      postsUrl.searchParams.set('limit', '25');
      
      if (cursor) {
        postsUrl.searchParams.set('after', cursor);
      }
      
      const postsRes = await fetch(postsUrl.toString());
      const postsData: any = await postsRes.json();
      
      // Check rate limit
      const appUsage = postsRes.headers.get('x-app-usage');
      if (appUsage) {
        try {
          const usage = JSON.parse(appUsage);
          if (usage.call_count > 80) {
            await context.env.THREADSIQ_DB.prepare(
              `UPDATE import_jobs SET status = 'paused', rate_limit_paused_until = datetime('now', '+15 minutes'), cursor = ?, total_fetched = ? WHERE id = ?`
            ).bind(cursor || '', postsFetched, job.id).run();
            return new Response(JSON.stringify({
              status: 'paused',
              total_fetched: postsFetched,
              message: 'Rate limit approaching, paused for 15 minutes',
            }), { status: 200, headers });
          }
        } catch {}
      }
      
      if (!postsData.data || postsData.data.length === 0) {
        hasMore = false;
        phaseComplete = true;
        break;
      }
      
      // Collect posts for batch insert
      const batch: any[] = [];
      for (const post of postsData.data) {
        if (isPhaseA) {
          const postDate = new Date(post.timestamp);
          if (postsFetched >= targetPosts || postDate < sixMonthsAgo) {
            hasMore = false;
            phaseComplete = true;
            break;
          }
        }
        batch.push(post);
        postsFetched++;
      }
      
      // Batch insert (1 subrequest)
      if (batch.length > 0) {
        const stmts = batch.map(post =>
          context.env.THREADSIQ_DB.prepare(
            `INSERT INTO posts (user_id, threads_post_id, text, posted_at, media_type, permalink)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(threads_post_id) DO NOTHING`
          ).bind(lineUserId, post.id, post.text || '', post.timestamp, post.media_type || null, post.permalink || '')
        );
        await context.env.THREADSIQ_DB.batch(stmts);
      }
      
      // Pagination
      if (postsData.paging?.cursors?.after) {
        cursor = postsData.paging.cursors.after;
      } else {
        hasMore = false;
        phaseComplete = true;
      }
      
      // Update progress
      await context.env.THREADSIQ_DB.prepare(
        `UPDATE import_jobs SET total_fetched = ?, cursor = ? WHERE id = ?`
      ).bind(postsFetched, cursor || '', job.id).run();
    }
    
    // Handle phase transitions
    if (phaseComplete && isPhaseA) {
      await context.env.THREADSIQ_DB.prepare(
        `UPDATE import_jobs SET status = 'phase_b', phase_a_completed_at = datetime('now') WHERE id = ?`
      ).bind(job.id).run();
      return new Response(JSON.stringify({
        status: 'phase_a_completed',
        phase: 'a',
        total_fetched: postsFetched,
        message: 'Phase A completed. Embeddings will be computed next.',
      }), { status: 200, headers });
    } else if (phaseComplete && !isPhaseA) {
      await context.env.THREADSIQ_DB.prepare(
        `UPDATE import_jobs SET status = 'completed', completed_at = datetime('now'), cursor = '' WHERE id = ?`
      ).bind(job.id).run();
      return new Response(JSON.stringify({
        status: 'completed',
        phase: 'b',
        total_fetched: postsFetched,
        message: 'All posts imported successfully',
      }), { status: 200, headers });
    } else {
      return new Response(JSON.stringify({
        status: isPhaseA ? 'phase_a_partial' : 'phase_b_partial',
        phase: isPhaseA ? 'a' : 'b',
        total_fetched: postsFetched,
        message: 'Partial progress. Call again to continue.',
      }), { status: 200, headers });
    }
    
  } catch (error) {
    console.error('Import continue error:', error);
    return new Response(JSON.stringify({ error: 'import_continue_failed', detail: String(error) }), {
      status: 500, headers,
    });
  }
};
