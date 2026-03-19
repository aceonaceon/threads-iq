// DELETE /api/admin/imports/[id] - Delete a user's posts, post_insights, and import_jobs

interface Env {
  THREADSIQ_STORE: KVNamespace;
  THREADSIQ_DB: D1Database;
  LINE_CHANNEL_SECRET: string;
  ADMIN_USER_ID: string;
}

interface TokenPayload {
  sub: string;
  name: string;
  pic: string;
  iat: number;
  exp: number;
}

// Unicode-safe base64 decode
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
    
    // Check expiration
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

function getCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

async function handleOptions(request: Request): Promise<Response | null> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders() });
  }
  return null;
}

export const onRequestDelete: PagesFunction<Env> = async (context): Promise<Response> => {
  const optionsResponse = await handleOptions(context.request);
  if (optionsResponse) return optionsResponse;

  const headers = getCorsHeaders();
  const userId = context.params.id as string;

  if (!userId) {
    return new Response(JSON.stringify({ error: 'user_id required' }), { status: 400, headers });
  }

  // Auth check
  const token = getAuthToken(context.request);
  if (!token) {
    return new Response(JSON.stringify({ error: '請先登入' }), { status: 401, headers });
  }

  const payload = await verifyToken(token, context.env.LINE_CHANNEL_SECRET);
  if (!payload) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers });
  }

  if (!context.env.ADMIN_USER_ID || payload.sub !== context.env.ADMIN_USER_ID) {
    return new Response(JSON.stringify({ error: '無權限' }), { status: 403, headers });
  }

  try {
    // Delete in order: post_insights -> posts -> import_jobs
    // (post_insights and posts have foreign key references)
    
    const insightsResult = await context.env.THREADSIQ_DB.prepare(
      'DELETE FROM post_insights WHERE user_id = ?'
    ).bind(userId).run();

    const postsResult = await context.env.THREADSIQ_DB.prepare(
      'DELETE FROM posts WHERE user_id = ?'
    ).bind(userId).run();

    const jobsResult = await context.env.THREADSIQ_DB.prepare(
      'DELETE FROM import_jobs WHERE user_id = ?'
    ).bind(userId).run();

    return new Response(JSON.stringify({
      success: true,
      deleted: {
        posts: postsResult.meta.changes || 0,
        insights: insightsResult.meta.changes || 0,
        import_jobs: jobsResult.meta.changes || 0,
      },
    }), { status: 200, headers });
  } catch (error) {
    console.error('Admin delete user data error:', error);
    return new Response(JSON.stringify({ error: 'failed_to_delete', detail: String(error) }), {
      status: 500,
      headers,
    });
  }
};
