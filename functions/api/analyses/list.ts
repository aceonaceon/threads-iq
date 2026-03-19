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

  // Get user data to check plan
  const userKey = `user:${payload.sub}`;
  const userStr = await context.env.THREADSIQ_STORE.get(userKey);
  let userPlan = 'free';
  if (userStr) {
    const userData = JSON.parse(userStr);
    userPlan = userData.plan || 'free';
  }

  // Get analyses from KV
  const analysesKey = `analyses:${payload.sub}`;
  const analysesStr = await context.env.THREADSIQ_STORE.get(analysesKey);
  
  if (!analysesStr) {
    return new Response(JSON.stringify({ analyses: [], total: 0, limited: false }), { status: 200, headers });
  }

  const allAnalyses = JSON.parse(analysesStr);
  const totalCount = allAnalyses.length;
  
  // Check if user is on free plan (undefined, null, or "free")
  const isFreePlan = !userPlan || userPlan === 'free';
  
  // Sort by createdAt descending (newest first)
  const sortedAnalyses = [...allAnalyses].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  
  // Limit to 3 for free users
  const limitedAnalyses = isFreePlan ? sortedAnalyses.slice(0, 3) : sortedAnalyses;
  const isLimited = isFreePlan && totalCount > 3;
  
  // Transform to summary format
  const summaries = limitedAnalyses.map((a: any) => ({
    id: a.id,
    postCount: a.posts?.length || 0,
    clusterCount: a.result?.topicAnalysis?.clusters?.length || 0,
    healthScore: a.result?.topicAnalysis?.healthScore || 0,
    createdAt: a.createdAt,
  }));

  return new Response(JSON.stringify({ 
    analyses: summaries, 
    total: totalCount,
    limited: isLimited
  }), { status: 200, headers });
};
