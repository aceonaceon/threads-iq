// Shared types and utilities for import API

export interface Env {
  THREADSIQ_STORE: KVNamespace;
  THREADSIQ_DB: D1Database;
  OPENAI_API_KEY: string;
  LINE_CHANNEL_SECRET: string;
  ADMIN_USER_ID: string;
  META_APP_ID: string;
  META_APP_SECRET: string;
}

export interface TokenPayload {
  sub: string;
  name: string;
  pic: string;
  iat: number;
  exp: number;
}

// Unicode-safe base64 decode
export function base64Decode(str: string): string {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export async function verifyToken(token: string, secret: string): Promise<TokenPayload | null> {
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

export function getAuthToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

export function getCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function handleOptions(request: Request): Promise<Response | null> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders() });
  }
  return null;
}
