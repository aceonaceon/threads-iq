interface Env {
  OPENAI_API_KEY: string;
  LINE_CHANNEL_SECRET: string;
  THREADSIQ_STORE: KVNamespace;
}

interface PostRequest {
  posts: string[];
}

interface EmbeddingResponse {
  embeddings: number[][];
}

// Token verification helpers
interface TokenPayload {
  sub: string;
  name: string;
  pic: string;
  iat: number;
  exp: number;
}

function base64Decode(str: string): string {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

async function verifyToken(token: string, secret: string): Promise<TokenPayload | null> {
  try {
    const [payloadStr, sigStr] = token.split('.');
    if (!payloadStr || !sigStr) return null;
    
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadStr));
    const sigBytes = new Uint8Array(signature);
    let sigBinary = '';
    for (const byte of sigBytes) {
      sigBinary += String.fromCharCode(byte);
    }
    const expectedSig = btoa(sigBinary);
    
    if (sigStr !== expectedSig) return null;
    
    const payload = JSON.parse(base64Decode(payloadStr)) as TokenPayload;
    
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;
    
    return payload;
  } catch {
    return null;
  }
}

function getAuthToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

// Check and reset weekly quota, return updated user data
async function checkAndConsumeUsage(userId: string, kv: KVNamespace, secret: string): Promise<{ user: any; remaining: number; bonusRemaining: number; error?: string }> {
  const userStr = await kv.get(`user:${userId}`);
  if (!userStr) {
    return { user: null, remaining: 0, bonusRemaining: 0, error: 'User not found' };
  }

  let userData = JSON.parse(userStr);
  
  // Check and reset weekly quota if needed
  const now = new Date();
  const resetAt = new Date(userData.weeklyResetAt);
  const daysSinceReset = (now.getTime() - resetAt.getTime()) / (1000 * 60 * 60 * 24);
  
  if (daysSinceReset >= 7) {
    userData.weeklyUses = 0;
    userData.weeklyResetAt = now.toISOString();
  }

  const FREE_USES = 3;
  const weeklyRemaining = Math.max(0, FREE_USES - (userData.weeklyUses || 0));
  const bonusUses = userData.bonusUses || 0;

  // Determine which quota to use
  if (weeklyRemaining > 0) {
    // Use weekly quota
    userData.weeklyUses = (userData.weeklyUses || 0) + 1;
  } else if (bonusUses > 0) {
    // Use bonus uses
    userData.bonusUses = bonusUses - 1;
  } else {
    // No quota left
    return { 
      user: userData, 
      remaining: 0, 
      bonusRemaining: 0,
      error: 'usage_exceeded' 
    };
  }

  // Save updated user
  await kv.put(`user:${userId}`, JSON.stringify(userData));

  const newWeeklyRemaining = Math.max(0, FREE_USES - (userData.weeklyUses || 0));
  const newBonusRemaining = userData.bonusUses || 0;

  return {
    user: userData,
    remaining: newWeeklyRemaining,
    bonusRemaining: newBonusRemaining,
  };
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
    // Verify authentication
    const token = getAuthToken(context.request);
    if (!token) {
      return new Response(
        JSON.stringify({ error: '請先登入' }),
        { status: 401, headers }
      );
    }

    const payload = await verifyToken(token, context.env.LINE_CHANNEL_SECRET);
    if (!payload) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers }
      );
    }

    // Check and consume usage quota
    const usageResult = await checkAndConsumeUsage(
      payload.sub,
      context.env.THREADSIQ_STORE,
      context.env.LINE_CHANNEL_SECRET
    );

    if (usageResult.error) {
      return new Response(
        JSON.stringify({ 
          error: usageResult.error, 
          message: '本週免費次數已用完',
          remaining: 0,
          bonusRemaining: 0,
        }),
        { status: 403, headers }
      );
    }

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
    console.log('API Key present:', !!apiKey);
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

    // Include remaining usage in response
    const responseData = {
      ...result,
      remaining: usageResult.remaining,
      bonusRemaining: usageResult.bonusRemaining,
    };

    return new Response(JSON.stringify(responseData), { status: 200, headers });

  } catch (error) {
    console.error('Error in /api/analyze:', error);
    return new Response(
      JSON.stringify({ error: '分析過程發生錯誤，請稍後再試' }),
      { status: 500, headers }
    );
  }
};
