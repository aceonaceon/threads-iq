// GET /api/admin/imports - List all users' import job status
// Copy auth pattern from stats.ts

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
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

async function handleOptions(request: Request): Promise<Response | null> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders() });
  }
  return null;
}

interface ImportJob {
  user_id: string;
  status: string;
  phase: string;
  total_fetched: number;
  target_posts: number;
  total_posts_in_db: number;
  total_with_embedding: number;
  earliest_post: string | null;
  latest_post: string | null;
  phase_a_completed_at: string | null;
  completed_at: string | null;
  started_at: string;
  rate_limit_paused_until: string | null;
}

export const onRequestGet: PagesFunction<Env> = async (context): Promise<Response> => {
  const optionsResponse = await handleOptions(context.request);
  if (optionsResponse) return optionsResponse;

  const headers = getCorsHeaders();

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
    // Get all import jobs with live counts
    const result = await context.env.THREADSIQ_DB.prepare(`
      SELECT 
        ij.user_id,
        ij.status,
        ij.phase,
        ij.total_fetched,
        ij.target_posts,
        ij.phase_a_completed_at,
        ij.completed_at,
        ij.started_at,
        ij.rate_limit_paused_until,
        (SELECT COUNT(*) FROM posts p WHERE p.user_id = ij.user_id) as total_posts_in_db,
        (SELECT COUNT(*) FROM posts p WHERE p.user_id = ij.user_id AND p.embedding IS NOT NULL) as total_with_embedding,
        (SELECT MIN(posted_at) FROM posts p WHERE p.user_id = ij.user_id) as earliest_post,
        (SELECT MAX(posted_at) FROM posts p WHERE p.user_id = ij.user_id) as latest_post
      FROM import_jobs ij
      WHERE ij.id IN (
        SELECT MAX(id) FROM import_jobs GROUP BY user_id
      )
      ORDER BY ij.started_at DESC
    `).all<ImportJob>();

    const imports = result.results || [];

    // Fetch display_name from KV for each user
    const importsWithNames = await Promise.all(
      imports.map(async (imp) => {
        let displayName = imp.user_id;
        try {
          const userStr = await context.env.THREADSIQ_STORE.get(`user:${imp.user_id}`);
          if (userStr) {
            const userData = JSON.parse(userStr);
            displayName = userData.displayName || userData.name || imp.user_id;
          }
        } catch (e) {
          console.error('Failed to get user from KV:', e);
        }
        
        return {
          user_id: imp.user_id,
          display_name: displayName,
          status: imp.status,
          phase: imp.phase,
          total_fetched: imp.total_fetched,
          target_posts: imp.target_posts,
          total_posts_in_db: imp.total_posts_in_db || 0,
          total_with_embedding: imp.total_with_embedding || 0,
          earliest_post: imp.earliest_post,
          latest_post: imp.latest_post,
          phase_a_completed_at: imp.phase_a_completed_at,
          completed_at: imp.completed_at,
          started_at: imp.started_at,
          rate_limit_paused_until: imp.rate_limit_paused_until,
        };
      })
    );

    return new Response(JSON.stringify({ imports: importsWithNames }), { status: 200, headers });
  } catch (error) {
    console.error('Admin imports error:', error);
    return new Response(JSON.stringify({ error: 'failed_to_fetch_imports', detail: String(error) }), {
      status: 500,
      headers,
    });
  }
};
