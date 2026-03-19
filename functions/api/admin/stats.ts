interface Env {
  LINE_CHANNEL_SECRET: string;
  ADMIN_USER_ID: string;
  THREADSIQ_STORE: KVNamespace;
}

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

async function verifyAdmin(token: string, env: Env): Promise<{ payload: TokenPayload | null; reason?: string }> {
  const payload = await verifyToken(token, env.LINE_CHANNEL_SECRET);
  if (!payload) return { payload: null, reason: 'token_verify_failed' };
  if (!env.ADMIN_USER_ID) return { payload: null, reason: 'admin_user_id_not_set' };
  if (payload.sub !== env.ADMIN_USER_ID) return { payload: null, reason: `sub_mismatch:${payload.sub}_vs_${env.ADMIN_USER_ID}` };
  return { payload };
}

// GET aggregate statistics
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
    return new Response(JSON.stringify({ error: '請先登入' }), { status: 401, headers });
  }

  const adminResult = await verifyAdmin(token, context.env);
  if (!adminResult.payload) {
    return new Response(JSON.stringify({ error: '無權限', reason: adminResult.reason }), { status: 403, headers });
  }
  const adminPayload = adminResult.payload;

  // List all user keys
  const listResult = await context.env.THREADSIQ_STORE.list({ prefix: 'user:' });
  
  let totalUsers = 0;
  let activeThisWeek = 0;
  let paidUsers = 0;
  let totalAnalysisUsed = 0;

  for (const key of listResult.keys) {
    const userStr = await context.env.THREADSIQ_STORE.get(key.name);
    if (userStr) {
      const user = JSON.parse(userStr);
      totalUsers++;
      
      // Active this week: weeklyUses > 0
      if ((user.weeklyUses || 0) > 0) {
        activeThisWeek++;
      }
      
      // Paid users: isPaid or plan is creator/pro
      if (user.isPaid || user.plan === 'creator' || user.plan === 'pro') {
        paidUsers++;
      }
      
      // Total analysis used
      totalAnalysisUsed += (user.weeklyUses || 0) + (user.bonusUses || 0);
    }
  }

  return new Response(JSON.stringify({
    totalUsers,
    activeThisWeek,
    paidUsers,
    totalAnalysisUsed,
  }), { status: 200, headers });
};