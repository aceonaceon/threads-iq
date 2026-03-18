interface Env {
  LINE_CHANNEL_ID: string;
  LINE_CHANNEL_SECRET: string;
  THREADSIQ_STORE: KVNamespace;
}

interface TokenPayload {
  sub: string;
  name: string;
  pic: string;
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
    const expectedSig = btoa(String.fromCharCode(...new Uint8Array(signature)));
    
    if (sigStr !== expectedSig) return null;
    
    const payload = JSON.parse(atob(payloadStr)) as TokenPayload;
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

const FREE_USES = 3;

export const onRequestPost: PagesFunction<Env> = async (context): Promise<Response> => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  const token = getAuthToken(context.request);
  if (!token) {
    return new Response(JSON.stringify({ error: '未登入' }), { status: 401, headers });
  }

  const payload = await verifyToken(token, context.env.LINE_CHANNEL_SECRET);
  if (!payload) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers });
  }

  try {
    const { id, posts, result } = await context.request.json();
    
    if (!id || !posts || !result) {
      return new Response(JSON.stringify({ error: '缺少必要資料' }), { status: 400, headers });
    }

    // Get current user data
    const userStr = await context.env.THREADSIQ_STORE.get(`user:${payload.sub}`);
    let userData = userStr ? JSON.parse(userStr) : { usageCount: 0 };
    
    // Check usage limit
    if ((userData.usageCount || 0) >= FREE_USES) {
      return new Response(JSON.stringify({ error: '已達免費使用次數上限' }), { status: 403, headers });
    }

    // Increment usage count
    userData.usageCount = (userData.usageCount || 0) + 1;
    await context.env.THREADSIQ_STORE.put(`user:${payload.sub}`, JSON.stringify(userData));

    // Save analysis
    const analysisData = {
      id,
      posts,
      result,
      createdAt: new Date().toISOString(),
    };
    
    // Get existing analyses
    const analysesKey = `analyses:${payload.sub}`;
    const existingAnalysesStr = await context.env.THREADSIQ_STORE.get(analysesKey);
    const existingAnalyses = existingAnalysesStr ? JSON.parse(existingAnalysesStr) : [];
    existingAnalyses.unshift(analysisData);
    
    // Keep only last 50 analyses
    const trimmedAnalyses = existingAnalyses.slice(0, 50);
    await context.env.THREADSIQ_STORE.put(analysesKey, JSON.stringify(trimmedAnalyses));

    return new Response(JSON.stringify({
      success: true,
      remainingUses: Math.max(0, FREE_USES - userData.usageCount),
    }), { status: 200, headers });

  } catch (error) {
    console.error('Error saving analysis:', error);
    return new Response(JSON.stringify({ error: '儲存失敗' }), { status: 500, headers });
  }
};
