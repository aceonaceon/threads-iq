interface Env {
  LINE_CHANNEL_SECRET: string;
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

// Check and reset weekly quota if needed
function checkAndResetWeeklyQuota(userData: any): any {
  const now = new Date();
  const resetAt = new Date(userData.weeklyResetAt);
  const daysSinceReset = (now.getTime() - resetAt.getTime()) / (1000 * 60 * 60 * 24);
  
  if (daysSinceReset >= 7) {
    userData.weeklyUses = 0;
    userData.weeklyResetAt = now.toISOString();
  }
  
  return userData;
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
    return new Response(JSON.stringify({ error: '請先登入' }), { status: 401, headers });
  }

  const payload = await verifyToken(token, context.env.LINE_CHANNEL_SECRET);
  if (!payload) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers });
  }

  // Get user data from KV
  const userStr = await context.env.THREADSIQ_STORE.get(`user:${payload.sub}`);
  if (!userStr) {
    return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers });
  }

  let userData = JSON.parse(userStr);
  userData = checkAndResetWeeklyQuota(userData);
  
  const FREE_USES = 3;
  const weeklyRemaining = Math.max(0, FREE_USES - (userData.weeklyUses || 0));
  const bonusUses = userData.bonusUses || 0;

  // Get referral list
  const referralListKey = `referrals:${payload.sub}`;
  const referralListStr = await context.env.THREADSIQ_STORE.get(referralListKey);
  const referralList = referralListStr ? JSON.parse(referrerListStr) : [];

  return new Response(JSON.stringify({
    referralCode: userData.referralCode || '',
    referralLink: userData.referralCode 
      ? `https://threads-iq.pages.dev/?ref=${userData.referralCode}`
      : '',
    totalReferrals: userData.totalReferrals || 0,
    bonusUses,
    weeklyRemaining,
    commissionBalance: userData.commissionBalance || 0,
    referralList,
  }), { status: 200, headers });
};
