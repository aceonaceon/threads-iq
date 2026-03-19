// GET /api/posts/list - Get user's posts from D1 with plan-based limits
import { Env, verifyToken, getAuthToken, getCorsHeaders, handleOptions } from '../import/_shared';

export const onRequestGet: PagesFunction<Env> = async (context): Promise<Response> => {
  const optionsResponse = await handleOptions(context.request);
  if (optionsResponse) return optionsResponse;
  
  const headers = getCorsHeaders();
  
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
    
    // Calculate date threshold for creator plan (6 months ago)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const sixMonthsAgoStr = sixMonthsAgo.toISOString();
    
    let query: string;
    let limitClause: string;
    
    if (plan === 'free') {
      // Free: limit to 30 posts
      limitClause = 'LIMIT 30';
      query = `
        SELECT p.*, pi.views, pi.likes, pi.replies, pi.reposts, pi.quotes
        FROM posts p
        LEFT JOIN (
          SELECT threads_post_id, views, likes, replies, reposts, quotes,
                 ROW_NUMBER() OVER (PARTITION BY threads_post_id ORDER BY fetched_at DESC) as rn
          FROM post_insights
        ) pi ON p.threads_post_id = pi.threads_post_id AND pi.rn = 1
        WHERE p.user_id = ?
        ORDER BY p.posted_at DESC
        ${limitClause}
      `;
    } else if (plan === 'creator') {
      // Creator: limit to 300 posts OR posted_at > 6 months ago (whichever gives more)
      // We'll fetch 300 + all old posts, then deduplicate in application
      limitClause = 'LIMIT 1000'; // generous limit, we'll filter in app
      query = `
        SELECT p.*, pi.views, pi.likes, pi.replies, pi.reposts, pi.quotes
        FROM posts p
        LEFT JOIN (
          SELECT threads_post_id, views, likes, replies, reposts, quotes,
                 ROW_NUMBER() OVER (PARTITION BY threads_post_id ORDER BY fetched_at DESC) as rn
          FROM post_insights
        ) pi ON p.threads_post_id = pi.threads_post_id AND pi.rn = 1
        WHERE p.user_id = ? AND (p.posted_at > ? OR p.id IN (
          SELECT id FROM posts WHERE user_id = ? ORDER BY posted_at DESC LIMIT 300
        ))
        ORDER BY p.posted_at DESC
        ${limitClause}
      `;
    } else {
      // Pro: no limit
      query = `
        SELECT p.*, pi.views, pi.likes, pi.replies, pi.reposts, pi.quotes
        FROM posts p
        LEFT JOIN (
          SELECT threads_post_id, views, likes, replies, reposts, quotes,
                 ROW_NUMBER() OVER (PARTITION BY threads_post_id ORDER BY fetched_at DESC) as rn
          FROM post_insights
        ) pi ON p.threads_post_id = pi.threads_post_id AND pi.rn = 1
        WHERE p.user_id = ?
        ORDER BY p.posted_at DESC
      `;
    }
    
    const posts = plan === 'creator'
      ? await context.env.THREADSIQ_DB.prepare(query).bind(lineUserId, sixMonthsAgoStr, lineUserId).all<any>()
      : await context.env.THREADSIQ_DB.prepare(query).bind(lineUserId).all<any>();
    
    let postsList = posts.results || [];
    
    // For creator: filter to ensure we get max 300 recent OR all old posts
    if (plan === 'creator') {
      const recentPosts = postsList.filter((p: any) => new Date(p.posted_at) >= sixMonthsAgo);
      const oldPosts = postsList.filter((p: any) => new Date(p.posted_at) < sixMonthsAgo);
      
      // Take up to 300 recent, keep all old
      const recentLimit = recentPosts.slice(0, 300);
      postsList = [...recentLimit, ...oldPosts];
    }
    
    // Get total count
    const countResult = await context.env.THREADSIQ_DB.prepare(
      'SELECT COUNT(*) as count FROM posts WHERE user_id = ?'
    ).bind(lineUserId).first<any>();
    
    const totalCount = countResult?.count || 0;
    
    // Format posts for response
    const formattedPosts = postsList.map((post: any) => ({
      id: post.id,
      threads_post_id: post.threads_post_id,
      text: post.text,
      posted_at: post.posted_at,
      media_type: post.media_type,
      permalink: post.permalink,
      has_embedding: !!post.embedding,
      insights: {
        views: post.views || 0,
        likes: post.likes || 0,
        replies: post.replies || 0,
        reposts: post.reposts || 0,
        quotes: post.quotes || 0,
      },
    }));
    
    return new Response(JSON.stringify({
      posts: formattedPosts,
      total: totalCount,
      plan,
      limit_applied: plan === 'free' ? 30 : plan === 'creator' ? '300 or 6 months' : 'unlimited',
    }), { status: 200, headers });
    
  } catch (error) {
    console.error('Posts list error:', error);
    return new Response(JSON.stringify({ error: 'fetch_posts_failed', detail: String(error) }), {
      status: 500,
      headers,
    });
  }
};
