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
    
    // Get actual post count from D1
    const postCountResult = await context.env.THREADSIQ_DB.prepare(
      'SELECT COUNT(*) as count FROM posts WHERE user_id = ?'
    ).bind(lineUserId).first<any>();
    
    const postCount = postCountResult?.count || 0;
    
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
      post_count: postCount,
      total_with_embedding: job.total_with_embedding,
    }), { status: 200, headers });
    
  } catch (error) {
    console.error('Import status error:', error);
    return new Response(JSON.stringify({ error: 'status_check_failed', detail: String(error) }), {
      status: 500,
      headers,
    });
  }
};
