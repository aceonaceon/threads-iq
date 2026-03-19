interface Env {
  LINE_CHANNEL_SECRET: string;
  ADMIN_USER_ID: string;
  THREADSIQ_STORE: KVNamespace;
}

function base64Decode(str: string): string {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

async function verifyToken(token: string, secret: string): Promise<any> {
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

    const payload = JSON.parse(base64Decode(payloadStr));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;

    return payload;
  } catch {
    return null;
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: corsHeaders });
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const authHeader = context.request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: '請先登入' }), { status: 401, headers: corsHeaders });
  }

  const token = authHeader.substring(7);
  const payload = await verifyToken(token, context.env.LINE_CHANNEL_SECRET);
  if (!payload || payload.sub !== context.env.ADMIN_USER_ID) {
    return new Response(JSON.stringify({ error: '無權限' }), { status: 403, headers: corsHeaders });
  }

  // Get userId from dynamic route param
  const userId = (context.params as any).id as string;
  if (!userId) {
    return new Response(JSON.stringify({ error: '缺少用戶 ID' }), { status: 400, headers: corsHeaders });
  }

  // Parse body
  let body: { plan?: string };
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: corsHeaders });
  }

  // Get existing user
  const userStr = await context.env.THREADSIQ_STORE.get(`user:${userId}`);
  if (!userStr) {
    return new Response(JSON.stringify({ error: '用戶不存在' }), { status: 404, headers: corsHeaders });
  }

  const userData = JSON.parse(userStr);

  // Update fields
  if (body.plan) {
    userData.plan = body.plan;
    userData.isPaid = body.plan === 'creator' || body.plan === 'pro';
  }

  // Save back to KV
  await context.env.THREADSIQ_STORE.put(`user:${userId}`, JSON.stringify(userData));

  return new Response(JSON.stringify({ success: true, user: userData }), { status: 200, headers: corsHeaders });
};
