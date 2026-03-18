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

export const onRequestGet: PagesFunction<Env> = async (context): Promise<Response> => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

  // Get ID from URL path - the pattern is /api/analyses/[id]
  const url = new URL(context.request.url);
  const pathParts = url.pathname.split('/');
  const id = pathParts[pathParts.length - 1];

  if (!id) {
    return new Response(JSON.stringify({ error: '缺少分析 ID' }), { status: 400, headers });
  }

  // Get analyses from KV
  const analysesKey = `analyses:${payload.sub}`;
  const analysesStr = await context.env.THREADSIQ_STORE.get(analysesKey);
  
  if (!analysesStr) {
    return new Response(JSON.stringify({ error: '找不到分析' }), { status: 404, headers });
  }

  const analyses = JSON.parse(analysesStr);
  const analysis = analyses.find((a: any) => a.id === id);

  if (!analysis) {
    return new Response(JSON.stringify({ error: '找不到分析' }), { status: 404, headers });
  }

  return new Response(JSON.stringify({
    id: analysis.id,
    posts: analysis.posts,
    result: analysis.result,
    createdAt: analysis.createdAt,
  }), { status: 200, headers });
};
