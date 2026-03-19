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

async function verifyAdmin(token: string, env: Env): Promise<TokenPayload | null> {
  const payload = await verifyToken(token, env.LINE_CHANNEL_SECRET);
  if (!payload) return null;
  if (payload.sub !== env.ADMIN_USER_ID) return null;
  return payload;
}

// GET all users / PUT update user
export const onRequestGet: PagesFunction<Env> = async (context): Promise<Response> => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
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

  const adminPayload = await verifyAdmin(token, context.env);
  if (!adminPayload) {
    return new Response(JSON.stringify({ error: '無權限' }), { status: 403, headers });
  }

  // List all user keys
  const listResult = await context.env.THREADSIQ_STORE.list({ prefix: 'user:' });
  const users = [];

  for (const key of listResult.keys) {
    const userStr = await context.env.THREADSIQ_STORE.get(key.name);
    if (userStr) {
      users.push(JSON.parse(userStr));
    }
  }

  // Sort by createdAt descending
  users.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return new Response(JSON.stringify({ users }), { status: 200, headers });
};

export const onRequestPut: PagesFunction<Env> = async (context): Promise<Response> => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
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

  const adminPayload = await verifyAdmin(token, context.env);
  if (!adminPayload) {
    return new Response(JSON.stringify({ error: '無權限' }), { status: 403, headers });
  }

  // Extract userId from URL: /api/admin/users/:userId
  const url = new URL(context.request.url);
  const pathParts = url.pathname.split('/');
  const userId = pathParts[pathParts.length - 1];

  if (!userId) {
    return new Response(JSON.stringify({ error: '缺少用戶 ID' }), { status: 400, headers });
  }

  // Parse body
  let body: { plan?: string };
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers });
  }

  // Get existing user
  const userStr = await context.env.THREADSIQ_STORE.get(`user:${userId}`);
  if (!userStr) {
    return new Response(JSON.stringify({ error: '用戶不存在' }), { status: 404, headers });
  }

  const userData = JSON.parse(userStr);

  // Update fields
  if (body.plan) {
    userData.plan = body.plan;
    // Also update isPaid based on plan
    userData.isPaid = body.plan === 'creator' || body.plan === 'pro';
  }

  // Save back to KV
  await context.env.THREADSIQ_STORE.put(`user:${userId}`, JSON.stringify(userData));

  return new Response(JSON.stringify({ success: true, user: userData }), { status: 200, headers });
};