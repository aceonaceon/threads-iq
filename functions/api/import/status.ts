// GET /api/import/status - Get import job status
import { Env, verifyToken, getAuthToken, getCorsHeaders, handleOptions } from './_shared';

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
    
    // Get latest import job
    const job = await context.env.THREADSIQ_DB.prepare(
      `SELECT * FROM import_jobs WHERE user_id = ? ORDER BY started_at DESC LIMIT 1`
    ).bind(lineUserId).first<any>();
    
    if (!job) {
      return new Response(JSON.stringify({
        status: 'no_import',
        phase: null,
        total_fetched: 0,
        target_posts: 300,
        phase_a_completed: false,
        post_count: 0,
      }), { status: 200, headers });
    }
    
    // Get user's plan for visibility cap
    const userStr = await context.env.THREADSIQ_STORE.get(`user:${lineUserId}`);
    const userData = userStr ? JSON.parse(userStr) : {};
    const plan = userData.plan || 'free';
    
    // Get actual counts from D1 (live, not stale job record) - filtered by current Threads account
    const countResult = await context.env.THREADSIQ_DB.prepare(
      `SELECT 
        COUNT(*) as total_posts,
        SUM(CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END) as with_embedding,
        MIN(posted_at) as earliest_post,
        MAX(posted_at) as latest_post
       FROM posts WHERE user_id = ? AND threads_user_id = ?`
    ).bind(lineUserId, threadsUserId).first<any>();
    
    const totalPosts = countResult?.total_posts || 0;
    const withEmbedding = countResult?.with_embedding || 0;
    
    // Calculate plan-based visible limits (use totalPosts after it's defined)
    const maxVisible = plan === 'free' ? 30 : plan === 'creator' ? 300 : totalPosts;
    
    // Cap counts by plan (don't leak Phase B data to non-pro users)
    const visiblePosts = Math.min(totalPosts, maxVisible);
    const visibleWithEmbedding = Math.min(withEmbedding, maxVisible);
    
    return new Response(JSON.stringify({
      status: job.status,
      phase: job.phase,
      total_fetched: job.total_fetched,
      target_posts: job.target_posts,
      phase_a_completed: !!job.phase_a_completed_at,
      phase_a_completed_at: job.phase_a_completed_at,
      completed_at: job.completed_at,
      error: job.error,
      cursor: job.cursor,
      rate_limit_paused_until: job.rate_limit_paused_until,
      post_count: visiblePosts,
      total_with_embedding: visibleWithEmbedding,
      earliest_post: countResult?.earliest_post,
      latest_post: countResult?.latest_post,
      plan,
    }), { status: 200, headers });
    
  } catch (error) {
    console.error('Import status error:', error);
    return new Response(JSON.stringify({ error: 'status_check_failed', detail: String(error) }), {
      status: 500,
      headers,
    });
  }
};
