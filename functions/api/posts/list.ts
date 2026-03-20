// GET /api/posts/list - Get user's posts from D1 with plan-based limits, sorting and pagination
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
    
    // Get Threads user ID from KV
    const tokenStr = await context.env.THREADSIQ_STORE.get(`threads_token:${lineUserId}`);
    if (!tokenStr) {
      return new Response(JSON.stringify({ error: 'threads_not_connected' }), { status: 401, headers });
    }
    const tokenData = JSON.parse(tokenStr);
    const threadsUserId = tokenData.threadsUserId || '';
    
    if (!threadsUserId) {
      return new Response(JSON.stringify({ error: 'threads_not_connected' }), { status: 401, headers });
    }
    
    // Get query params for sorting and pagination
    const url = new URL(context.request.url);
    const sortBy = url.searchParams.get('sortBy') || 'posted_at';
    const sortOrder = url.searchParams.get('sortOrder') || 'desc';
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('pageSize') || '20');
    
    // Validate sort params
    const validSortColumns = ['posted_at', 'views', 'likes', 'replies', 'reposts'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'posted_at';
    const sortDirection = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    
    // Get user's plan from KV
    const userStr = await context.env.THREADSIQ_STORE.get(`user:${lineUserId}`);
    const userData = userStr ? JSON.parse(userStr) : {};
    const plan = userData.plan || 'free';
    
    // Get total count first (filtered by current Threads account)
    const countResult = await context.env.THREADSIQ_DB.prepare(
      'SELECT COUNT(*) as count FROM posts WHERE user_id = ? AND threads_user_id = ?'
    ).bind(lineUserId, threadsUserId).first<any>();
    
    const totalCount = countResult?.count || 0;
    
    // Calculate plan-based limit
    let maxPosts: number;
    if (plan === 'free') {
      maxPosts = 30;
    } else if (plan === 'creator') {
      maxPosts = 300;
    } else {
      maxPosts = totalCount; // Pro: unlimited
    }
    
    // Calculate pagination
    const effectivePageSize = Math.min(pageSize, maxPosts);
    const totalPages = Math.ceil(Math.min(totalCount, maxPosts) / effectivePageSize);
    const offset = (page - 1) * effectivePageSize;
    
    // Build the ORDER BY clause - handle engagement rate specially
    let orderByClause: string;
    if (sortColumn === 'posted_at') {
      orderByClause = `ORDER BY p.posted_at ${sortDirection}`;
    } else {
      // For insights columns, we need to handle NULL values
      orderByClause = `ORDER BY COALESCE(pi.${sortColumn}, 0) ${sortDirection}`;
    }
    
    // Build the query with JOIN for insights
    let query: string;
    
    if (plan === 'free') {
      // Free: limit to 30 posts (already sorted by posted_at DESC)
      query = `
        SELECT p.id, p.threads_post_id, p.text, p.posted_at, p.media_type, p.permalink, p.embedding,
               pi.views, pi.likes, pi.replies, pi.reposts, pi.quotes
        FROM posts p
        LEFT JOIN (
          SELECT threads_post_id, views, likes, replies, reposts, quotes,
                 ROW_NUMBER() OVER (PARTITION BY threads_post_id ORDER BY fetched_at DESC) as rn
          FROM post_insights
        ) pi ON p.threads_post_id = pi.threads_post_id AND pi.rn = 1
        WHERE p.user_id = ? AND p.threads_user_id = ?
        ORDER BY p.posted_at DESC
        LIMIT 30
      `;
    } else if (plan === 'creator') {
      // Creator: limit to 300 posts OR posted_at > 6 months ago (whichever gives more)
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const sixMonthsAgoStr = sixMonthsAgo.toISOString();
      
      query = `
        SELECT p.id, p.threads_post_id, p.text, p.posted_at, p.media_type, p.permalink, p.embedding,
               pi.views, pi.likes, pi.replies, pi.reposts, pi.quotes
        FROM posts p
        LEFT JOIN (
          SELECT threads_post_id, views, likes, replies, reposts, quotes,
                 ROW_NUMBER() OVER (PARTITION BY threads_post_id ORDER BY fetched_at DESC) as rn
          FROM post_insights
        ) pi ON p.threads_post_id = pi.threads_post_id AND pi.rn = 1
        WHERE p.user_id = ? AND p.threads_user_id = ? AND (p.posted_at > ? OR p.id IN (
          SELECT id FROM posts WHERE user_id = ? AND threads_user_id = ? ORDER BY posted_at DESC LIMIT 300
        ))
        ${orderByClause}
        LIMIT ${effectivePageSize} OFFSET ${offset}
      `;
    } else {
      // Pro: no limit
      query = `
        SELECT p.id, p.threads_post_id, p.text, p.posted_at, p.media_type, p.permalink, p.embedding,
               pi.views, pi.likes, pi.replies, pi.reposts, pi.quotes
        FROM posts p
        LEFT JOIN (
          SELECT threads_post_id, views, likes, replies, reposts, quotes,
                 ROW_NUMBER() OVER (PARTITION BY threads_post_id ORDER BY fetched_at DESC) as rn
          FROM post_insights
        ) pi ON p.threads_post_id = pi.threads_post_id AND pi.rn = 1
        WHERE p.user_id = ? AND p.threads_user_id = ?
        ${orderByClause}
        LIMIT ${effectivePageSize} OFFSET ${offset}
      `;
    }
    
    let posts: any;
    if (plan === 'creator') {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const sixMonthsAgoStr = sixMonthsAgo.toISOString();
      posts = await context.env.THREADSIQ_DB.prepare(query).bind(lineUserId, threadsUserId, sixMonthsAgoStr, lineUserId, threadsUserId).all<any>();
    } else {
      posts = await context.env.THREADSIQ_DB.prepare(query).bind(lineUserId, threadsUserId).all<any>();
    }
    
    let postsList = posts.results || [];
    
    // For creator: filter to ensure we get max 300 recent OR all old posts (before sorting)
    if (plan === 'creator' && sortColumn === 'posted_at') {
      // Only apply this filter for default sort
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const recentPosts = postsList.filter((p: any) => new Date(p.posted_at) >= sixMonthsAgo);
      const oldPosts = postsList.filter((p: any) => new Date(p.posted_at) < sixMonthsAgo);
      const recentLimit = recentPosts.slice(0, 300);
      postsList = [...recentLimit, ...oldPosts];
    }
    
    // Check if embeddings should be included
    const includeEmbeddings = url.searchParams.get('include_embeddings') === 'true';
    
    // Format posts for response
    const formattedPosts = postsList.map((post: any) => {
      const insights = {
        views: post.views || 0,
        likes: post.likes || 0,
        replies: post.replies || 0,
        reposts: post.reposts || 0,
        quotes: post.quotes || 0,
      };
      
      // Calculate engagement rate
      const totalEngagement = insights.likes + insights.replies + insights.reposts;
      const engagementRate = insights.views > 0 
        ? ((totalEngagement / insights.views) * 100).toFixed(2)
        : '0.00';
      
      const formatted: any = {
        id: post.id,
        threads_post_id: post.threads_post_id,
        text: post.text,
        posted_at: post.posted_at,
        media_type: post.media_type,
        permalink: post.permalink,
        has_embedding: !!post.embedding,
        insights,
        engagement_rate: parseFloat(engagementRate),
      };
      if (includeEmbeddings && post.embedding) {
        formatted.embedding = post.embedding;
      }
      return formatted;
    });
    
    // For free users, apply sorting in-memory after fetching
    if (plan === 'free' && sortColumn !== 'posted_at') {
      formattedPosts.sort((a: any, b: any) => {
        const aVal = sortColumn === 'views' ? a.insights.views 
          : sortColumn === 'likes' ? a.insights.likes
          : sortColumn === 'replies' ? a.insights.replies
          : a.insights.reposts;
        const bVal = sortColumn === 'views' ? b.insights.views 
          : sortColumn === 'likes' ? b.insights.likes
          : sortColumn === 'replies' ? b.insights.replies
          : b.insights.reposts;
        
        if (sortDirection === 'ASC') {
          return aVal - bVal;
        } else {
          return bVal - aVal;
        }
      });
    }
    
    // Return plan-limited total (don't leak Phase B count to non-pro users)
    const visibleTotal = Math.min(totalCount, maxPosts);
    
    return new Response(JSON.stringify({
      posts: formattedPosts,
      total: visibleTotal,
      page,
      pageSize: effectivePageSize,
      totalPages: Math.ceil(visibleTotal / effectivePageSize),
      plan,
      sortBy: sortColumn,
      sortOrder: sortDirection.toLowerCase(),
    }), { status: 200, headers });
    
  } catch (error) {
    console.error('Posts list error:', error);
    return new Response(JSON.stringify({ error: 'fetch_posts_failed', detail: String(error) }), {
      status: 500,
      headers,
    });
  }
};
