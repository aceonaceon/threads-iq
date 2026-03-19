// POST /api/import/start - Start importing posts from Threads to D1
import { Env, verifyToken, getAuthToken, getCorsHeaders, handleOptions, base64Decode } from './_shared';

interface ThreadPost {
  id: string;
  text: string;
  timestamp: string;
  media_type?: string;
  media_url?: string;
  permalink: string;
}

// Helper: check if we're approaching timeout (25s safety margin)
function isApproachingTimeout(startTime: number, threshold = 25000): boolean {
  return Date.now() - startTime > threshold;
}

// Helper: compute embeddings for posts
async function computeEmbeddings(posts: { id: number; text: string }[], env: Env): Promise<number> {
  if (posts.length === 0) return 0;
  
  const texts = posts.map(p => p.text || '').filter(t => t.length > 0);
  if (texts.length === 0) return 0;
  
  // OpenAI batch limit is 2048
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
    
    // Update each post with its embedding
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
    
    // Get user's plan from KV
    const userStr = await context.env.THREADSIQ_STORE.get(`user:${lineUserId}`);
    const userData = userStr ? JSON.parse(userStr) : {};
    const plan = userData.plan || 'free';
    
    // Check if user already has a running import job
    const existingJob = await context.env.THREADSIQ_DB.prepare(
      `SELECT * FROM import_jobs WHERE user_id = ? AND status IN ('phase_a', 'phase_b', 'pending') ORDER BY started_at DESC LIMIT 1`
    ).bind(lineUserId).first<any>();
    
    if (existingJob) {
      // Return existing job status
      return new Response(JSON.stringify({
        status: existingJob.status,
        phase: existingJob.phase,
        total_fetched: existingJob.total_fetched,
        target_posts: existingJob.target_posts,
        phase_a_completed: !!existingJob.phase_a_completed_at,
        cursor: existingJob.cursor,
        message: existingJob.status === 'phase_a' 
          ? 'Import in progress (Phase A)' 
          : existingJob.status === 'phase_b'
          ? 'Import in progress (Phase B - background)'
          : 'Import pending',
      }), { status: 200, headers });
    }
    
    // Get Threads token from KV
    const tokenStr = await context.env.THREADSIQ_STORE.get(`threads_token:${lineUserId}`);
    if (!tokenStr) {
      return new Response(JSON.stringify({ error: 'threads_not_connected' }), { status: 400, headers });
    }
    
    const tokenData = JSON.parse(tokenStr);
    const accessToken = tokenData.accessToken;
    
    // Determine target posts based on plan
    const targetPosts = (plan === 'pro') ? 1000 : 300;
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    // Create new import job
    const jobResult = await context.env.THREADSIQ_DB.prepare(
      `INSERT INTO import_jobs (user_id, status, phase, target_posts, started_at)
       VALUES (?, 'phase_a', 'a', ?, datetime('now'))`
    ).bind(lineUserId, targetPosts).run();
    
    const jobId = jobResult.meta.last_row_id;
    
    // Fetch posts from Threads API
    let cursor: string | undefined;
    let postsFetched = 0;
    let phaseAPosts: any[] = [];
    let hasMore = true;
    
    while (hasMore && postsFetched < targetPosts && !isApproachingTimeout(startTime)) {
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
          // Pause due to rate limit
          await context.env.THREADSIQ_DB.prepare(
            `UPDATE import_jobs SET status = 'paused', rate_limit_paused_until = datetime('now', '+15 minutes'), cursor = ? WHERE id = ?`
          ).bind(cursor || '', jobId).run();
          
          return new Response(JSON.stringify({
            status: 'paused',
            total_fetched: postsFetched,
            message: 'Rate limit approaching, paused for 15 minutes',
          }), { status: 200, headers });
        }
      }
      
      if (!postsData.data || postsData.data.length === 0) {
        hasMore = false;
        break;
      }
      
      for (const post of postsData.data) {
        // Phase A limit: 300 posts or 6 months old
        const postDate = new Date(post.timestamp);
        if (postsFetched >= targetPosts || postDate < sixMonthsAgo) {
          hasMore = false;
          break;
        }
        
        // Insert post into D1 (use ON CONFLICT to skip duplicates)
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
        
        // Fetch insights for this post
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
          
          // Insert insights
          await context.env.THREADSIQ_DB.prepare(
            `INSERT INTO post_insights (threads_post_id, user_id, views, likes, replies, reposts, quotes, fetched_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
          ).bind(post.id, lineUserId, views, likes, replies, reposts, quotes).run();
          
        } catch (e) {
          console.error(`Failed to get insights for post ${post.id}:`, e);
        }
        
        // Store post for embedding computation
        if (insertPost.meta.changes > 0) {
          const postIdResult = await context.env.THREADSIQ_DB.prepare(
            'SELECT id FROM posts WHERE threads_post_id = ?'
          ).bind(post.id).first<any>();
          
          if (postIdResult) {
            phaseAPosts.push({ id: postIdResult.id, text: post.text || '' });
          }
        }
        
        postsFetched++;
      }
      
      // Check for next page
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
    
    // Compute embeddings for Phase A posts
    if (phaseAPosts.length > 0) {
      const embeddedCount = await computeEmbeddings(phaseAPosts, context.env);
      await context.env.THREADSIQ_DB.prepare(
        `UPDATE import_jobs SET total_with_embedding = ? WHERE id = ?`
      ).bind(embeddedCount, jobId).run();
    }
    
    // Mark Phase A as completed
    await context.env.THREADSIQ_DB.prepare(
      `UPDATE import_jobs SET status = 'phase_b', phase_a_completed_at = datetime('now') WHERE id = ?`
    ).bind(jobId).run();
    
    // Return response
    const isTimeout = isApproachingTimeout(startTime);
    
    return new Response(JSON.stringify({
      status: isTimeout ? 'phase_a_partial' : 'phase_a_completed',
      phase: 'a',
      total_fetched: postsFetched,
      target_posts: targetPosts,
      phase_a_completed: true,
      embedded_count: phaseAPosts.length,
      cursor: cursor || '',
      message: isTimeout 
        ? 'Phase A partially completed due to timeout. Call /api/import/continue to continue.'
        : 'Phase A completed. Starting Phase B in background.',
    }), { status: 200, headers });
    
  } catch (error) {
    console.error('Import start error:', error);
    return new Response(JSON.stringify({ error: 'import_failed', detail: String(error) }), {
      status: 500,
      headers,
    });
  }
};
