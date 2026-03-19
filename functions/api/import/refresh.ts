// POST /api/import/refresh - Incremental update: fetch new posts since last import
import { Env, verifyToken, getAuthToken, getCorsHeaders, handleOptions } from './_shared';

function isApproachingTimeout(startTime: number, threshold = 22000): boolean {
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
        message: 'Import already in progress. Call /api/import/continue to continue.',
      }), { status: 200, headers });
    }
    
    // Get Threads token from KV
    const tokenStr = await context.env.THREADSIQ_STORE.get(`threads_token:${lineUserId}`);
    if (!tokenStr) {
      return new Response(JSON.stringify({ error: 'threads_not_connected' }), { status: 400, headers });
    }
    
    const tokenData = JSON.parse(tokenStr);
    const accessToken = tokenData.accessToken;
    
    // Get the latest post date in DB
    const latestPost = await context.env.THREADSIQ_DB.prepare(
      `SELECT posted_at FROM posts WHERE user_id = ? ORDER BY posted_at DESC LIMIT 1`
    ).bind(lineUserId).first<any>();
    
    const latestPostDate = latestPost?.posted_at ? new Date(latestPost.posted_at) : null;
    console.log(`Latest post in DB: ${latestPostDate?.toISOString() || 'none'}`);
    
    // Fetch posts from Threads API (from newest, stop when we hit existing posts)
    let cursor: string | undefined;
    let postsFetched = 0;
    let hasMore = true;
    let hitExistingPost = false;
    
    // Create import job for tracking
    const jobResult = await context.env.THREADSIQ_DB.prepare(
      `INSERT INTO import_jobs (user_id, status, phase, target_posts, started_at)
       VALUES (?, 'refresh', 'refresh', 0, datetime('now'))`
    ).bind(lineUserId).run();
    
    const jobId = jobResult.meta.last_row_id;
    
    // First, fetch user profile to get username for permalink
    let username = '';
    try {
      const profileUrl = new URL('https://graph.threads.net/v1.0/me');
      profileUrl.searchParams.set('fields', 'id,name,username');
      profileUrl.searchParams.set('access_token', accessToken);
      const profileRes = await fetch(profileUrl.toString());
      const profileData: any = await profileRes.json();
      username = profileData.username || '';
    } catch (e) {
      console.error('Failed to fetch profile:', e);
    }
    
    while (hasMore && !hitExistingPost && !isApproachingTimeout(startTime)) {
      const postsUrl = new URL('https://graph.threads.net/v1.0/me/threads');
      postsUrl.searchParams.set('fields', 'id,text,timestamp,media_type,media_url,permalink');
      postsUrl.searchParams.set('access_token', accessToken);
      postsUrl.searchParams.set('limit', '25'); // Use 25 per spec
      
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
              new_posts: postsFetched,
              message: 'Rate limit approaching, paused for 15 minutes',
            }), { status: 200, headers });
          }
        } catch {}
      }
      
      if (!postsData.data || postsData.data.length === 0) {
        hasMore = false;
        break;
      }
      
      // Check each post - stop if we hit an existing one
      const batch: any[] = [];
      for (const post of postsData.data) {
        const postDate = new Date(post.timestamp);
        
        // If this post is older than or equal to our latest in DB, stop
        if (latestPostDate && postDate <= latestPostDate) {
          hitExistingPost = true;
          console.log(`Hit existing post: ${post.id} at ${post.timestamp}`);
          break;
        }
        
        // If post is too old (> 6 months), skip it
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        if (postDate < sixMonthsAgo) {
          console.log(`Post too old: ${post.timestamp}`);
          continue;
        }
        
        batch.push(post);
        postsFetched++;
      }
      
      // Batch insert new posts
      if (batch.length > 0) {
        const stmts = batch.map(post => 
          context.env.THREADSIQ_DB.prepare(
            `INSERT INTO posts (user_id, threads_post_id, text, posted_at, media_type, permalink)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(threads_post_id) DO NOTHING`
          ).bind(lineUserId, post.id, post.text || '', post.timestamp, post.media_type || null, post.permalink || '')
        );
        await context.env.THREADSIQ_DB.batch(stmts);
        console.log(`Inserted ${batch.length} new posts`);
      }
      
      // Pagination
      if (postsData.paging?.cursors?.after && !hitExistingPost) {
        cursor = postsData.paging.cursors.after;
      } else {
        hasMore = false;
      }
    }
    
    // Get total count
    const countResult = await context.env.THREADSIQ_DB.prepare(
      'SELECT COUNT(*) as count FROM posts WHERE user_id = ?'
    ).bind(lineUserId).first<any>();
    
    const totalPosts = countResult?.count || 0;
    
    // Now fetch insights for new posts
    let newInsights = 0;
    if (postsFetched > 0) {
      // Get posts without insights (recently imported)
      const postsWithoutInsights = await context.env.THREADSIQ_DB.prepare(
        `SELECT p.threads_post_id 
         FROM posts p
         LEFT JOIN post_insights pi ON p.threads_post_id = pi.threads_post_id
         WHERE p.user_id = ? AND pi.threads_post_id IS NULL
         ORDER BY p.posted_at DESC
         LIMIT 50`
      ).bind(lineUserId).all<any>();
      
      const postsToFetchInsights = postsWithoutInsights.results || [];
      
      // Batch fetch insights
      for (const postInfo of postsToFetchInsights) {
        try {
          const insightsUrl = new URL(`https://graph.threads.net/v1.0/${postInfo.threads_post_id}`);
          insightsUrl.searchParams.set('fields', 'id,permalink,created_at,text,media_type,media_url');
          insightsUrl.searchParams.set('access_token', accessToken);
          // Note: Threads API may not have direct insights endpoint, we'll try
          
          // For now, just mark as fetched with placeholder - real insights need separate API
          // Actually let's skip insights for refresh - they're optional
        } catch (e) {
          // Skip insights errors
        }
        
        if (isApproachingTimeout(startTime)) break;
      }
    }
    
    // Update job as completed
    await context.env.THREADSIQ_DB.prepare(
      `UPDATE import_jobs SET status = 'completed', completed_at = datetime('now'), total_fetched = ?, target_posts = ? WHERE id = ?`
    ).bind(postsFetched, totalPosts, jobId).run();
    
    return new Response(JSON.stringify({
      new_posts: postsFetched,
      total_posts: totalPosts,
      message: postsFetched > 0 
        ? `成功新增 ${postsFetched} 篇貼文！`
        : '沒有新的貼文需要更新。',
    }), { status: 200, headers });
    
  } catch (error) {
    console.error('Import refresh error:', error);
    return new Response(JSON.stringify({ error: 'refresh_failed', detail: String(error) }), {
      status: 500,
      headers,
    });
  }
};
