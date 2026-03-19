// POST /api/import/embeddings - Compute embeddings for posts that don't have them
import { Env, verifyToken, getAuthToken, getCorsHeaders, handleOptions, base64Decode } from './_shared';

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
    
    // Get posts without embeddings (batch of 100 at a time)
    const posts = await context.env.THREADSIQ_DB.prepare(
      `SELECT id, text FROM posts 
       WHERE user_id = ? AND embedding IS NULL AND text IS NOT NULL AND text != ''
       ORDER BY posted_at DESC
       LIMIT 100`
    ).bind(lineUserId).all<any>();
    
    const postsToEmbed = posts.results || [];
    
    if (postsToEmbed.length === 0) {
      return new Response(JSON.stringify({ 
        status: 'complete',
        message: 'All posts have embeddings',
        total_embedded: 0,
      }), { status: 200, headers });
    }
    
    // Compute embeddings via OpenAI
    const texts = postsToEmbed.map((p: any) => p.text).filter((t: string) => t.length > 0);
    
    if (texts.length === 0) {
      return new Response(JSON.stringify({ 
        status: 'complete',
        message: 'No valid texts to embed',
        total_embedded: 0,
      }), { status: 200, headers });
    }
    
    console.log(`Computing embeddings for ${texts.length} posts for user ${lineUserId}`);
    
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${context.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: texts,
      }),
    });
    
    if (!embeddingResponse.ok) {
      const errText = await embeddingResponse.text();
      console.error('OpenAI embedding error:', errText);
      return new Response(JSON.stringify({ 
        error: 'embedding_failed',
        detail: `OpenAI API error: ${embeddingResponse.status}`,
      }), { status: 500, headers });
    }
    
    const embeddingData: any = await embeddingResponse.json();
    const embeddings = embeddingData.data || [];
    
    // Batch update posts with embeddings (was one-by-one = 100 subrequests, now 1)
    const updateStmts: any[] = [];
    let embIdx = 0;
    
    for (const post of postsToEmbed) {
      if (!post.text || post.text.length === 0) continue;
      if (embIdx >= embeddings.length) break;
      
      updateStmts.push(
        context.env.THREADSIQ_DB.prepare('UPDATE posts SET embedding = ? WHERE id = ?')
          .bind(JSON.stringify(embeddings[embIdx].embedding), post.id)
      );
      embIdx++;
    }
    
    // D1 batch limit ~100 statements, split if needed
    let updated = 0;
    for (let i = 0; i < updateStmts.length; i += 100) {
      await context.env.THREADSIQ_DB.batch(updateStmts.slice(i, i + 100));
      updated += Math.min(100, updateStmts.length - i);
    }
    
    // Check remaining
    const remaining = await context.env.THREADSIQ_DB.prepare(
      `SELECT COUNT(*) as count FROM posts 
       WHERE user_id = ? AND embedding IS NULL AND text IS NOT NULL AND text != ''`
    ).bind(lineUserId).first<any>();
    
    const remainingCount = remaining?.count || 0;
    
    // Update import job
    await context.env.THREADSIQ_DB.prepare(
      `UPDATE import_jobs SET total_with_embedding = (
        SELECT COUNT(*) FROM posts WHERE user_id = ? AND embedding IS NOT NULL
      ) WHERE user_id = ? AND id = (
        SELECT MAX(id) FROM import_jobs WHERE user_id = ?
      )`
    ).bind(lineUserId, lineUserId, lineUserId).run();
    
    return new Response(JSON.stringify({
      status: remainingCount > 0 ? 'in_progress' : 'complete',
      embedded_this_batch: updated,
      remaining: remainingCount,
      message: remainingCount > 0 
        ? `Embedded ${updated} posts, ${remainingCount} remaining. Call again to continue.`
        : `All embeddings complete! Embedded ${updated} posts in this batch.`,
    }), { status: 200, headers });
    
  } catch (error) {
    console.error('Embedding error:', error);
    return new Response(JSON.stringify({ error: 'embedding_failed', detail: String(error) }), {
      status: 500,
      headers,
    });
  }
};
