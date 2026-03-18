interface Env {
  THREADSIQ_STORE: KVNamespace;
  OPENAI_API_KEY: string;
}

interface ThreadPost {
  id: string;
  text: string;
  timestamp: string;
  media_type?: string;
  media_url?: string;
  permalink: string;
  insights?: {
    views: number;
    likes: number;
    replies: number;
    reposts: number;
    quotes: number;
  };
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    // Get LINE user ID from JWT token
    const authHeader = context.request.headers.get('Authorization');
    let lineUserId = '';
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const parts = token.split('.');
        if (parts.length >= 2) {
          const binary = atob(parts[0]);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          const decoded = new TextDecoder().decode(bytes);
          const payload = JSON.parse(decoded);
          lineUserId = payload.sub || '';
        }
      } catch (e) {
        console.error('Failed to decode JWT:', e);
      }
    }

    if (!lineUserId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get Threads token from KV
    const tokenStr = await context.env.THREADSIQ_STORE.get(`threads_token:${lineUserId}`);
    if (!tokenStr) {
      return new Response(JSON.stringify({ error: 'threads_not_connected' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const tokenData = JSON.parse(tokenStr);
    const accessToken = tokenData.accessToken;

    // Fetch user's Threads posts
    const posts: ThreadPost[] = [];
    let hasMore = true;
    let cursor: string | undefined;

    // Fetch up to 90 days of posts (Threads API typically returns recent posts)
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    
    while (hasMore && posts.length < 100) {
      const postsUrl = new URL('https://graph.threads.net/v1.0/me/threads');
      postsUrl.searchParams.set('fields', 'id,text,timestamp,media_type,media_url,permalink');
      postsUrl.searchParams.set('access_token', accessToken);
      postsUrl.searchParams.set('limit', '50');
      
      if (cursor) {
        postsUrl.searchParams.set('after', cursor);
      }

      const postsRes = await fetch(postsUrl.toString());
      const postsData: any = await postsRes.json();

      if (!postsData.data) {
        break;
      }

      for (const post of postsData.data) {
        // Filter posts within 90 days
        const postDate = new Date(post.timestamp);
        if (postDate < ninetyDaysAgo) {
          hasMore = false;
          break;
        }

        posts.push({
          id: post.id,
          text: post.text || '',
          timestamp: post.timestamp,
          media_type: post.media_type,
          media_url: post.media_url,
          permalink: post.permalink,
        });
      }

      // Check for pagination
      if (postsData.paging?.cursors?.after) {
        cursor = postsData.paging.cursors.after;
      } else {
        hasMore = false;
      }
    }

    console.log(`Fetched ${posts.length} posts for user ${lineUserId}`);

    // Fetch insights for each post (batch to avoid rate limiting)
    const insightsPosts: ThreadPost[] = [];
    const batchSize = 10;
    
    for (let i = 0; i < posts.length; i += batchSize) {
      const batch = posts.slice(i, i + batchSize);
      
      // Process batch in parallel
      const insightsResults = await Promise.all(
        batch.map(async (post) => {
          try {
            const insightsUrl = new URL(`https://graph.threads.net/v1.0/${post.id}/insights`);
            insightsUrl.searchParams.set('metric', 'views,likes,replies,reposts,quotes');
            insightsUrl.searchParams.set('access_token', accessToken);
            
            const insightsRes = await fetch(insightsUrl.toString());
            const insightsData: any = await insightsRes.json();
            
            if (insightsData.data) {
              const insights: any = {};
              for (const metric of insightsData.data) {
                insights[metric.metric_name] = metric.value || 0;
              }
              return { ...post, insights };
            }
          } catch (e) {
            console.error(`Failed to get insights for post ${post.id}:`, e);
          }
          return post;
        })
      );
      
      insightsPosts.push(...insightsResults);
      
      // Small delay between batches to avoid rate limiting
      if (i + batchSize < posts.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Store posts in KV with 1-hour cache
    const cacheKey = `threads_posts:${lineUserId}`;
    const cacheData = {
      posts: insightsPosts,
      fetchedAt: new Date().toISOString(),
      count: insightsPosts.length,
    };
    
    await context.env.THREADSIQ_STORE.put(cacheKey, JSON.stringify(cacheData));

    // Return structured data
    return new Response(JSON.stringify({
      success: true,
      posts: insightsPosts,
      count: insightsPosts.length,
      oldestPost: insightsPosts.length > 0 ? insightsPosts[insightsPosts.length - 1]?.timestamp : null,
      newestPost: insightsPosts.length > 0 ? insightsPosts[0]?.timestamp : null,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Import error:', error);
    return new Response(JSON.stringify({ error: 'import_failed', detail: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
