// POST /api/import/continue - Continue importing posts (Phase A partial or Phase B)
import { Env, verifyToken, getAuthToken, getCorsHeaders, handleOptions } from './_shared';

// Helper: compute embeddings for posts
async function computeEmbeddings(posts: { id: number; text: string }[], env: Env): Promise<number> {
  if (posts.length === 0) return 0;
  
  const texts = posts.map(p => p.text || '').filter(t => t.length > 0);
  if (texts.length === 0) return 0;
  
  const batchSize = 2048;
  let processed = 0;
  
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: batch,
      }),
    });
    
    if (!response.ok) {
      console.error('OpenAI embedding error:', await response.text());
      continue;
    }
    
    const data: any = await response.json();
    const embeddings = data.data || [];
    
    let embIdx = 0;
    for (const post of posts) {
      if (post.text && embeddings[embIdx]) {
        const embedding = JSON.stringify(embeddings[embIdx].embedding);
        await env.THREADSIQ_DB.prepare(
          'UPDATE posts SET embedding = ? WHERE id = ?'
        ).bind(embedding, post.id).run();
        processed++;
        embIdx++;
      }
    }
  }
  
  return processed;
}

// Helper: check if approaching timeout
function isApproachingTimeout(startTime: number, threshold = 25000): boolean {
  return Date.now() - startTime > threshold;
}

export const onRequestPost: PagesFunction<Env> = async (context): Promise<Response> => {
  const optionsResponse = await handleOptions(context.request);
  if (optionsResponse) return optionsResponse;
  
  const headers = getCorsHeaders();
  const startTime = Date.now();
  
  try {
    // Verify auth
    const token = getAuthToken(context.request);
    if (!token) {
      return new Response(JSON.stringify({ error: '未登入' }), { status: 401, headers });
    }
    
    const payload = await verifyToken(token, context.env.LINE_CHANNEL_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers });
    }
    
    const lineUserId = payload.sub;
    
    // Get user's plan
    const userStr = await context.env.THREADSIQ_STORE.get(`user:${lineUserId}`);
    const userData = userStr ? JSON.parse(userStr) : {};
    const plan = userData.plan || 'free';
    
    // Find active import job with cursor
    const job = await context.env.THREADSIQ_DB.prepare(
      `SELECT * FROM import_jobs 
       WHERE user_id = ? AND status IN ('phase_a', 'phase_b', 'paused') AND cursor IS NOT NULL AND cursor != ''
       ORDER BY started_at DESC LIMIT 1`
    ).bind(lineUserId).first<any>();
    
    if (!job) {
      // Check if there's a completed job
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
      // Resume from paused state
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
    
    // Determine if Phase A or Phase B
    const isPhaseA = job.phase === 'a' && !job.phase_a_completed_at;
    const targetPosts = job.target_posts || 300;
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    // Continue fetching
    let cursor = job.cursor || undefined;
    let postsFetched = job.total_fetched || 0;
    let newPosts: any[] = [];
    let hasMore = true;
    let phaseComplete = false;
    
    while (hasMore && !isApproachingTimeout(startTime)) {
      const postsUrl = new URL('https://graph.threads.net/v1.0/me/threads');
      postsUrl.searchParams.set('fields', 'id,text,timestamp,media_type,media_url,permalink');
      postsUrl.searchParams.set('access_token', accessToken);
      postsUrl.searchParams.set('limit', '50');
      
      if (cursor) {
        postsUrl.searchParams.set('after', cursor);
      }
      
      const postsRes = await fetch(postsUrl.toString());
      const postsData: any = await postsRes.json();
      
      // Check rate limit
      const appUsage = postsRes.headers.get('x-app-usage');
      if (appUsage) {
        const usage = JSON.parse(appUsage);
        if (usage.call_count > 80) {
          await context.env.THREADSIQ_DB.prepare(
            `UPDATE import_jobs SET status = 'paused', rate_limit_paused_until = datetime('now', '+15 minutes'), cursor = ? WHERE id = ?`
          ).bind(cursor || '', job.id).run();
          
          return new Response(JSON.stringify({
            status: 'paused',
            total_fetched: postsFetched,
            message: 'Rate limit approaching, paused for 15 minutes',
          }), { status: 200, headers });
        }
      }
      
      if (!postsData.data || postsData.data.length === 0) {
        hasMore = false;
        phaseComplete = true;
        break;
      }
      
      for (const post of postsData.data) {
        // Phase A limit check
        if (isPhaseA) {
          const postDate = new Date(post.timestamp);
          if (postsFetched >= targetPosts || postDate < sixMonthsAgo) {
            hasMore = false;
            phaseComplete = true;
            break;
          }
        }
        
        // Insert post (skip duplicates)
        const insertPost = await context.env.THREADSIQ_DB.prepare(
          `INSERT INTO posts (user_id, threads_post_id, text, posted_at, media_type, permalink)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(threads_post_id) DO NOTHING`
        ).bind(
          lineUserId,
          post.id,
          post.text || '',
          post.timestamp,
          post.media_type || null,
          post.permalink || ''
        ).run();
        
        // Fetch insights
        try {
          const insightsUrl = new URL(`https://graph.threads.net/v1.0/${post.id}/insights`);
          insightsUrl.searchParams.set('metric', 'views,likes,replies,reposts,quotes');
          insightsUrl.searchParams.set('access_token', accessToken);
          
          const insightsRes = await fetch(insightsUrl.toString());
          const insightsData: any = await insightsRes.json();
          
          let views = 0, likes = 0, replies = 0, reposts = 0, quotes = 0;
          if (insightsData.data) {
            for (const metric of insightsData.data) {
              if (metric.metric_name === 'views') views = metric.value || 0;
              if (metric.metric_name === 'likes') likes = metric.value || 0;
              if (metric.metric_name === 'replies') replies = metric.value || 0;
              if (metric.metric_name === 'reposts') reposts = metric.value || 0;
              if (metric.metric_name === 'quotes') quotes = metric.value || 0;
            }
          }
          
          await context.env.THREADSIQ_DB.prepare(
            `INSERT INTO post_insights (threads_post_id, user_id, views, likes, replies, reposts, quotes, fetched_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
          ).bind(post.id, lineUserId, views, likes, replies, reposts, quotes).run();
          
        } catch (e) {
          console.error(`Failed to get insights for post ${post.id}:`, e);
        }
        
        // Track new posts for embedding
        if (insertPost.meta.changes > 0) {
          const postIdResult = await context.env.THREADSIQ_DB.prepare(
            'SELECT id FROM posts WHERE threads_post_id = ?'
          ).bind(post.id).first<any>();
          
          if (postIdResult) {
            newPosts.push({ id: postIdResult.id, text: post.text || '' });
          }
        }
        
        postsFetched++;
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
    
    // Compute embeddings for new posts
    if (newPosts.length > 0) {
      const embeddedCount = await computeEmbeddings(newPosts, context.env);
      await context.env.THREADSIQ_DB.prepare(
        `UPDATE import_jobs SET total_with_embedding = total_with_embedding + ? WHERE id = ?`
      ).bind(embeddedCount, job.id).run();
    }
    
    // Handle phase transitions
    if (phaseComplete && isPhaseA) {
      // Phase A complete, move to Phase B
      await context.env.THREADSIQ_DB.prepare(
        `UPDATE import_jobs SET status = 'phase_b', phase_a_completed_at = datetime('now') WHERE id = ?`
      ).bind(job.id).run();
      
      return new Response(JSON.stringify({
        status: 'phase_a_completed',
        phase: 'a',
        total_fetched: postsFetched,
        embedded_count: newPosts.length,
        cursor: cursor || '',
        message: 'Phase A completed. Phase B starting.',
      }), { status: 200, headers });
      
    } else if (phaseComplete && !isPhaseA) {
      // All done
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
      // Partial progress (timeout)
      return new Response(JSON.stringify({
        status: isPhaseA ? 'phase_a_partial' : 'phase_b_partial',
        phase: isPhaseA ? 'a' : 'b',
        total_fetched: postsFetched,
        embedded_count: newPosts.length,
        cursor: cursor || '',
        message: 'Partial progress. Call /api/import/continue to continue.',
      }), { status: 200, headers });
    }
    
  } catch (error) {
    console.error('Import continue error:', error);
    return new Response(JSON.stringify({ error: 'import_continue_failed', detail: String(error) }), {
      status: 500,
      headers,
    });
  }
};
