interface Env {
  LINE_CHANNEL_ID: string;
  LINE_CHANNEL_SECRET: string;
  THREADSIQ_STORE: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  
  if (!code) {
    return Response.redirect('https://threads-iq.pages.dev/login?error=no_code', 302);
  }
  
  // Exchange code for token
  const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${context.env.LINE_CHANNEL_ID}:${context.env.LINE_CHANNEL_SECRET}`)}`
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: 'https://threads-iq.pages.dev/auth/callback',
    }),
  });
  
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    console.error('Token exchange failed:', tokenData);
    return Response.redirect('https://threads-iq.pages.dev/login?error=token_failed', 302);
  }
  
  // Get user profile
  const profileRes = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const profile = await profileRes.json();
  
  if (!profile.userId) {
    console.error('Failed to get profile:', profile);
    return Response.redirect('https://threads-iq.pages.dev/login?error=profile_failed', 302);
  }
  
  // Check if user exists, preserve usage count
  const existingStr = await context.env.THREADSIQ_STORE.get(`user:${profile.userId}`);
  let userData: any = {
    lineUserId: profile.userId,
    displayName: profile.displayName,
    pictureUrl: profile.pictureUrl || '',
    createdAt: new Date().toISOString(),
    usageCount: 0,
    usageResetAt: new Date().toISOString(),
  };
  
  if (existingStr) {
    const existing = JSON.parse(existingStr);
    userData.usageCount = existing.usageCount || 0;
    userData.createdAt = existing.createdAt;
    userData.usageResetAt = existing.usageResetAt || new Date().toISOString();
  }
  
  // Save/update user in KV
  await context.env.THREADSIQ_STORE.put(`user:${profile.userId}`, JSON.stringify(userData));
  
  // Create simple JWT-like token (base64 encoded, signed with HMAC)
  const encoder = new TextEncoder();
  const payload = {
    sub: profile.userId,
    name: profile.displayName,
    pic: profile.pictureUrl || '',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 30 * 24 * 3600, // 30 days
  };
  
  const payloadStr = btoa(JSON.stringify(payload));
  
  // Sign with HMAC-SHA256 using channel secret
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(context.env.LINE_CHANNEL_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadStr));
  const sigStr = btoa(String.fromCharCode(...new Uint8Array(signature)));
  const token = `${payloadStr}.${sigStr}`;
  
  // Redirect to frontend with token
  return Response.redirect(`https://threads-iq.pages.dev/auth/success#token=${token}`, 302);
};
