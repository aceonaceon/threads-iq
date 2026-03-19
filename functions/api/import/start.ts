// POST /api/import/start - Start importing posts from Threads to D1
// Optimized: batch D1 inserts, skip per-post insights (defer to separate endpoint)
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
    
    // Get user's plan from KV
    const userStr = await context.env.THREADSIQ_STORE.get(`user:${lineUserId}`);
    const userData = userStr ? JSON.parse(userStr) : {};
    const plan = userData.plan || 'free';
    
    // Check if user already has a running import job
    const existingJob = await context.env.THREADSIQ_DB.prepare(
      `SELECT * FROM import_jobs WHERE user_id = ? AND status IN ('phase_a', 'phase_b', 'pending') ORDER BY started_at DESC LIMIT 1`
    ).bind(lineUserId).first<any>();
    
    if (existingJob) {
      return new Response(JSON.stringify({
        status: existingJob.status,
        phase: existingJob.phase,
        total_fetched: existingJob.total_fetched,
        target_posts: existingJob.target_posts,
        phase_a_completed: !!existingJob.phase_a_completed_at,
        cursor: existingJob.cursor,
        message: 'Import already in progress',
      }), { status: 200, headers });
    }
    
    // Get Threads token from KV
    const tokenStr = await context.env.THREADSIQ_STORE.get(`threads_token:${lineUserId}`);
    if (!tokenStr) {
      return new Response(JSON.stringify({ error: 'threads_not_connected' }), { status: 400, headers });
    }
    
    const tokenData = JSON.parse(tokenStr);
    const accessToken = tokenData.accessToken;
    
    const targetPosts = (plan === 'pro') ? 1000 : 300;
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    // Create import job
    const jobResult = await context.env.THREADSIQ_DB.prepare(
      `INSERT INTO import_jobs (user_id, status, phase, target_posts, started_at)
       VALUES (?, 'phase_a', 'a', ?, datetime('now'))`
    ).bind(lineUserId, targetPosts).run();
    
    const jobId = jobResult.meta.last_row_id;
    
    // Fetch posts from Threads API
    let cursor: string | undefined;
    let postsFetched = 0;
    let hasMore = true;
    
    while (hasMore && postsFetched < targetPosts && !isApproachingTimeout(startTime)) {
      const postsUrl = new URL('https://graph.threads.net/v1.0/me/threads');
      postsUrl.searchParams.set('fields', 'id,text,timestamp,media_type,media_url,permalink');
      postsUrl.searchParams.set('access_token', accessToken);
      postsUrl.searchParams.set('limit', '25'); // Smaller batch to stay within subrequest limit
      
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
            ).bind(cursor || '', postsFetched, jobId).run();
            return new Response(JSON.stringify({
              status: 'paused',
              total_fetched: postsFetched,
              target_posts: targetPosts,
              message: 'Rate limit approaching, paused for 15 minutes',
            }), { status: 200, headers });
          }
        } catch {}
      }
      
      if (!postsData.data || postsData.data.length === 0) {
        hasMore = false;
        break;
      }
      
      // Collect posts for batch insert
      const batch: any[] = [];
      for (const post of postsData.data) {
        const postDate = new Date(post.timestamp);
        if (postsFetched >= targetPosts || postDate < sixMonthsAgo) {
          hasMore = false;
          break;
        }
        batch.push(post);
        postsFetched++;
      }
      
      // Batch insert posts + fetch insights (paid plan: 1000 subrequests)
      if (batch.length > 0) {
        const postStmts = batch.map(post => 
          context.env.THREADSIQ_DB.prepare(
            `INSERT INTO posts (user_id, threads_post_id, text, posted_at, media_type, permalink)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(threads_post_id) DO NOTHING`
          ).bind(lineUserId, post.id, post.text || '', post.timestamp, post.media_type || null, post.permalink || '')
        );
        
        // Fetch insights for each post in this batch
        const insightStmts: any[] = [];
        for (const post of batch) {
          try {
            const insightsUrl = `https://graph.threads.net/v1.0/${post.id}/insights?metric=views,likes,replies,reposts,quotes&access_token=${accessToken}`;
            const insightsRes = await fetch(insightsUrl);
            const insightsData: any = await insightsRes.json();
            
            let views = 0, likes = 0, replies = 0, reposts = 0, quotes = 0;
            if (insightsData.data) {
              for (const m of insightsData.data) {
                const name = m.name || '';
                const val = m.values?.[0]?.value ?? m.value ?? 0;
                if (name === 'views') views = val;
                if (name === 'likes') likes = val;
                if (name === 'replies') replies = val;
                if (name === 'reposts') reposts = val;
                if (name === 'quotes') quotes = val;
              }
            }
            
            insightStmts.push(
              context.env.THREADSIQ_DB.prepare(
                `INSERT INTO post_insights (threads_post_id, user_id, views, likes, replies, reposts, quotes, fetched_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
              ).bind(post.id, lineUserId, views, likes, replies, reposts, quotes)
            );
          } catch {
            // Skip individual insight errors
          }
        }
        
        // Batch write posts + insights together
        const allStmts = [...postStmts, ...insightStmts];
        await context.env.THREADSIQ_DB.batch(allStmts);
      }
      
      // Pagination
      if (postsData.paging?.cursors?.after) {
        cursor = postsData.paging.cursors.after;
      } else {
        hasMore = false;
      }
      
      // Update job progress
      await context.env.THREADSIQ_DB.prepare(
        `UPDATE import_jobs SET total_fetched = ?, cursor = ? WHERE id = ?`
      ).bind(postsFetched, cursor || '', jobId).run();
    }
    
    // Check if Phase A is complete
    const phaseADone = postsFetched >= targetPosts || !hasMore;
    
    if (phaseADone) {
      await context.env.THREADSIQ_DB.prepare(
        `UPDATE import_jobs SET status = 'phase_b', phase_a_completed_at = datetime('now'), total_fetched = ? WHERE id = ?`
      ).bind(postsFetched, jobId).run();
    }
    
    return new Response(JSON.stringify({
      status: phaseADone ? 'phase_a_completed' : 'phase_a',
      phase: 'a',
      total_fetched: postsFetched,
      target_posts: targetPosts,
      phase_a_completed: phaseADone,
      cursor: cursor || '',
      message: phaseADone
        ? 'Phase A completed. Embeddings will be computed next.'
        : 'Import in progress. Call /api/import/continue to continue.',
    }), { status: 200, headers });
    
  } catch (error) {
    console.error('Import start error:', error);
    return new Response(JSON.stringify({ error: 'import_failed', detail: String(error) }), {
      status: 500, headers,
    });
  }
};
