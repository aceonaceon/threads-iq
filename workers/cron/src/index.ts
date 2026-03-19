// ThreadsIQ Cron Worker
// Runs every 5 minutes to:
// 1. Continue Phase B imports for all active users
// 2. Compute missing embeddings
// 3. Fetch missing insights

interface Env {
  THREADSIQ_DB: D1Database;
  THREADSIQ_STORE: KVNamespace;
  APP_URL: string;
  OPENAI_API_KEY: string;
}

// Process Phase B imports: fetch more posts from Threads API
async function processPhaseB(env: Env): Promise<{ processed: number; details: string[] }> {
  const details: string[] = [];
  
  // Find all active Phase B jobs
  const jobs = await env.THREADSIQ_DB.prepare(
    `SELECT * FROM import_jobs 
     WHERE status IN ('phase_b', 'paused')
     AND cursor IS NOT NULL AND cursor != ''
     ORDER BY started_at ASC`
  ).all<any>();
  
  const activeJobs = jobs.results || [];
  if (activeJobs.length === 0) {
    return { processed: 0, details: ['No active Phase B jobs'] };
  }
  
  for (const job of activeJobs) {
    // Check if paused and still within pause window
    if (job.status === 'paused' && job.rate_limit_paused_until) {
      const pauseUntil = new Date(job.rate_limit_paused_until);
      if (pauseUntil > new Date()) {
        details.push(`User ${job.user_id}: paused until ${job.rate_limit_paused_until}`);
        continue;
      }
      // Resume
      await env.THREADSIQ_DB.prepare(
        `UPDATE import_jobs SET status = 'phase_b' WHERE id = ?`
      ).bind(job.id).run();
    }
    
    // Get Threads token
    const tokenStr = await env.THREADSIQ_STORE.get(`threads_token:${job.user_id}`);
    if (!tokenStr) {
      details.push(`User ${job.user_id}: no Threads token`);
      continue;
    }
    
    const tokenData = JSON.parse(tokenStr);
    const accessToken = tokenData.accessToken;
    
    // Check token expiry
    if (tokenData.expiresAt && Date.now() > tokenData.expiresAt) {
      details.push(`User ${job.user_id}: Threads token expired`);
      continue;
    }
    
    let cursor = job.cursor;
    let postsFetched = job.total_fetched || 0;
    let hasMore = true;
    let batchCount = 0;
    const maxBatchesPerRun = 4; // Process up to 4 pages (100 posts) per cron run per user
    const startTime = Date.now();
    
    while (hasMore && batchCount < maxBatchesPerRun && (Date.now() - startTime) < 25000) {
      const postsUrl = new URL('https://graph.threads.net/v1.0/me/threads');
      postsUrl.searchParams.set('fields', 'id,text,timestamp,media_type,media_url,permalink');
      postsUrl.searchParams.set('access_token', accessToken);
      postsUrl.searchParams.set('limit', '25');
      
      if (cursor) {
        postsUrl.searchParams.set('after', cursor);
      }
      
      const postsRes = await fetch(postsUrl.toString());
      
      // Check rate limit
      const appUsage = postsRes.headers.get('x-app-usage');
      if (appUsage) {
        try {
          const usage = JSON.parse(appUsage);
          if (usage.call_count > 80) {
            await env.THREADSIQ_DB.prepare(
              `UPDATE import_jobs SET status = 'paused', rate_limit_paused_until = datetime('now', '+15 minutes'), cursor = ?, total_fetched = ? WHERE id = ?`
            ).bind(cursor || '', postsFetched, job.id).run();
            details.push(`User ${job.user_id}: rate limited, paused`);
            break;
          }
        } catch {}
      }
      
      const postsData: any = await postsRes.json();
      
      if (!postsData.data || postsData.data.length === 0) {
        hasMore = false;
        // Phase B complete!
        await env.THREADSIQ_DB.prepare(
          `UPDATE import_jobs SET status = 'completed', completed_at = datetime('now'), cursor = '' WHERE id = ?`
        ).bind(job.id).run();
        details.push(`User ${job.user_id}: Phase B completed! Total: ${postsFetched}`);
        break;
      }
      
      // Batch insert posts
      const stmts = postsData.data.map((post: any) =>
        env.THREADSIQ_DB.prepare(
          `INSERT INTO posts (user_id, threads_post_id, text, posted_at, media_type, permalink)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(threads_post_id) DO NOTHING`
        ).bind(job.user_id, post.id, post.text || '', post.timestamp, post.media_type || null, post.permalink || '')
      );
      await env.THREADSIQ_DB.batch(stmts);
      
      postsFetched += postsData.data.length;
      batchCount++;
      
      // Pagination
      if (postsData.paging?.cursors?.after) {
        cursor = postsData.paging.cursors.after;
      } else {
        hasMore = false;
        await env.THREADSIQ_DB.prepare(
          `UPDATE import_jobs SET status = 'completed', completed_at = datetime('now'), cursor = '' WHERE id = ?`
        ).bind(job.id).run();
        details.push(`User ${job.user_id}: Phase B completed! Total: ${postsFetched}`);
      }
      
      // Update progress
      await env.THREADSIQ_DB.prepare(
        `UPDATE import_jobs SET total_fetched = ?, cursor = ? WHERE id = ?`
      ).bind(postsFetched, cursor || '', job.id).run();
    }
    
    if (hasMore) {
      details.push(`User ${job.user_id}: fetched ${batchCount} pages, now at ${postsFetched} posts`);
    }
  }
  
  return { processed: activeJobs.length, details };
}

// Compute missing embeddings for all users
async function processEmbeddings(env: Env): Promise<{ embedded: number; details: string[] }> {
  const details: string[] = [];
  
  // Find users with posts missing embeddings
  const users = await env.THREADSIQ_DB.prepare(
    `SELECT user_id, COUNT(*) as missing 
     FROM posts 
     WHERE embedding IS NULL AND text IS NOT NULL AND text != ''
     GROUP BY user_id
     LIMIT 5`
  ).all<any>();
  
  const userList = users.results || [];
  if (userList.length === 0) {
    return { embedded: 0, details: ['All posts have embeddings'] };
  }
  
  let totalEmbedded = 0;
  
  for (const userRow of userList) {
    // Get 100 posts without embeddings
    const posts = await env.THREADSIQ_DB.prepare(
      `SELECT id, text FROM posts 
       WHERE user_id = ? AND embedding IS NULL AND text IS NOT NULL AND text != ''
       ORDER BY posted_at DESC LIMIT 100`
    ).bind(userRow.user_id).all<any>();
    
    const postsToEmbed = posts.results || [];
    if (postsToEmbed.length === 0) continue;
    
    const texts = postsToEmbed.map((p: any) => p.text).filter((t: string) => t.length > 0);
    if (texts.length === 0) continue;
    
    // Call OpenAI
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: texts,
      }),
    });
    
    if (!response.ok) {
      details.push(`User ${userRow.user_id}: OpenAI error ${response.status}`);
      continue;
    }
    
    const data: any = await response.json();
    const embeddings = data.data || [];
    
    // Batch update
    const stmts: any[] = [];
    let embIdx = 0;
    for (const post of postsToEmbed) {
      if (post.text && post.text.length > 0 && embIdx < embeddings.length) {
        stmts.push(
          env.THREADSIQ_DB.prepare('UPDATE posts SET embedding = ? WHERE id = ?')
            .bind(JSON.stringify(embeddings[embIdx].embedding), post.id)
        );
        embIdx++;
      }
    }
    
    if (stmts.length > 0) {
      // D1 batch limit is 100 statements
      for (let i = 0; i < stmts.length; i += 100) {
        await env.THREADSIQ_DB.batch(stmts.slice(i, i + 100));
      }
    }
    
    totalEmbedded += embIdx;
    details.push(`User ${userRow.user_id}: embedded ${embIdx} posts (${userRow.missing - embIdx} remaining)`);
  }
  
  return { embedded: totalEmbedded, details };
}

// Fetch insights for posts that don't have them (now possible with 1000 subrequest limit)
async function processInsights(env: Env): Promise<{ updated: number; details: string[] }> {
  const details: string[] = [];
  
  // Find users with posts missing insights
  const users = await env.THREADSIQ_DB.prepare(
    `SELECT p.user_id, COUNT(*) as missing
     FROM posts p
     LEFT JOIN post_insights pi ON p.threads_post_id = pi.threads_post_id
     WHERE pi.id IS NULL AND p.text IS NOT NULL
     GROUP BY p.user_id
     LIMIT 3`
  ).all<any>();
  
  const userList = users.results || [];
  if (userList.length === 0) {
    return { updated: 0, details: ['All posts have insights'] };
  }
  
  let totalUpdated = 0;
  
  for (const userRow of userList) {
    // Get Threads token
    const tokenStr = await env.THREADSIQ_STORE.get(`threads_token:${userRow.user_id}`);
    if (!tokenStr) continue;
    
    const tokenData = JSON.parse(tokenStr);
    if (tokenData.expiresAt && Date.now() > tokenData.expiresAt) continue;
    
    // Get posts missing insights (max 20 per user per cron run to respect rate limits)
    const posts = await env.THREADSIQ_DB.prepare(
      `SELECT p.threads_post_id
       FROM posts p
       LEFT JOIN post_insights pi ON p.threads_post_id = pi.threads_post_id
       WHERE pi.id IS NULL AND p.user_id = ?
       ORDER BY p.posted_at DESC
       LIMIT 20`
    ).bind(userRow.user_id).all<any>();
    
    const postList = posts.results || [];
    let updated = 0;
    
    for (const post of postList) {
      try {
        const insightsUrl = new URL(`https://graph.threads.net/v1.0/${post.threads_post_id}/insights`);
        insightsUrl.searchParams.set('metric', 'views,likes,replies,reposts,quotes');
        insightsUrl.searchParams.set('access_token', tokenData.accessToken);
        
        const insightsRes = await fetch(insightsUrl.toString());
        const insightsData: any = await insightsRes.json();
        
        let views = 0, likes = 0, replies = 0, reposts = 0, quotes = 0;
        if (insightsData.data) {
          for (const metric of insightsData.data) {
            const name = metric.name || metric.metric_name || '';
            const val = metric.value ?? metric.values?.[0]?.value ?? 0;
            if (name === 'views') views = val;
            if (name === 'likes') likes = val;
            if (name === 'replies') replies = val;
            if (name === 'reposts') reposts = val;
            if (name === 'quotes') quotes = val;
          }
        }
        
        await env.THREADSIQ_DB.prepare(
          `INSERT INTO post_insights (threads_post_id, user_id, views, likes, replies, reposts, quotes, fetched_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        ).bind(post.threads_post_id, userRow.user_id, views, likes, replies, reposts, quotes).run();
        
        updated++;
      } catch (e) {
        // Skip individual post errors
      }
    }
    
    totalUpdated += updated;
    details.push(`User ${userRow.user_id}: fetched insights for ${updated}/${postList.length} posts`);
  }
  
  return { updated: totalUpdated, details };
}

export default {
  // Cron trigger handler
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    console.log(`[Cron] Running at ${new Date().toISOString()}`);
    
    const results: any = {};
    
    // 1. Process Phase B imports
    try {
      results.phaseB = await processPhaseB(env);
      console.log(`[Cron] Phase B:`, results.phaseB);
    } catch (e) {
      console.error('[Cron] Phase B error:', e);
      results.phaseB = { error: String(e) };
    }
    
    // 2. Compute missing embeddings
    try {
      results.embeddings = await processEmbeddings(env);
      console.log(`[Cron] Embeddings:`, results.embeddings);
    } catch (e) {
      console.error('[Cron] Embeddings error:', e);
      results.embeddings = { error: String(e) };
    }
    
    // 3. Fetch missing insights
    try {
      results.insights = await processInsights(env);
      console.log(`[Cron] Insights:`, results.insights);
    } catch (e) {
      console.error('[Cron] Insights error:', e);
      results.insights = { error: String(e) };
    }
    
    console.log(`[Cron] Complete:`, JSON.stringify(results));
  },
  
  // HTTP handler (for manual trigger / health check)
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', time: new Date().toISOString() }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    if (url.pathname === '/trigger') {
      // Manual trigger (same as cron)
      const results: any = {};
      
      try { results.phaseB = await processPhaseB(env); } catch (e) { results.phaseB = { error: String(e) }; }
      try { results.embeddings = await processEmbeddings(env); } catch (e) { results.embeddings = { error: String(e) }; }
      try { results.insights = await processInsights(env); } catch (e) { results.insights = { error: String(e) }; }
      
      return new Response(JSON.stringify(results, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    return new Response('ThreadsIQ Cron Worker', { status: 200 });
  },
};
