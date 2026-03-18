interface Env {
  OPENAI_API_KEY: string;
}

interface PostRequest {
  posts: string[];
}

interface EmbeddingResponse {
  embeddings: number[][];
}

export const onRequestPost: PagesFunction<Env> = async (context): Promise<Response> => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  // Handle OPTIONS request
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  try {
    const { posts } = await context.request.json() as PostRequest;

    if (!posts || !Array.isArray(posts) || posts.length === 0) {
      return new Response(
        JSON.stringify({ error: '請提供貼文陣列' }),
        { status: 400, headers }
      );
    }

    if (posts.length < 3) {
      return new Response(
        JSON.stringify({ error: '至少需要 3 篇貼文才能進行分析' }),
        { status: 400, headers }
      );
    }

    const apiKey = context.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('OPENAI_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: '伺服器設定錯誤，請稍後再試' }),
        { status: 500, headers }
      );
    }

    // Call OpenAI Embeddings API
    // Using text-embedding-3-small (1536 dimensions)
    const embeddings: number[][] = [];

    // Process in batches to avoid rate limits
    const batchSize = 100;
    for (let i = 0; i < posts.length; i += batchSize) {
      const batch = posts.slice(i, i + batchSize);
      
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: batch,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenAI API error:', errorText);
        return new Response(
          JSON.stringify({ error: 'AI 服務暫時無法使用，請稍後再試' }),
          { status: 500, headers }
        );
      }

      const data = await response.json() as { data: Array<{ embedding: number[] }> };
      
      // Sort by index to maintain order
      const sortedData = data.data.sort((a, b) => a.index - b.index);
      for (const item of sortedData) {
        embeddings.push(item.embedding);
      }
    }

    const result: EmbeddingResponse = { embeddings };

    return new Response(JSON.stringify(result), { status: 200, headers });

  } catch (error) {
    console.error('Error in /api/analyze:', error);
    return new Response(
      JSON.stringify({ error: '分析過程發生錯誤，請稍後再試' }),
      { status: 500, headers }
    );
  }
};
