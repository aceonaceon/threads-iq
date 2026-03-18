interface Env {
  LINE_CHANNEL_ID: string;
  LINE_CHANNEL_SECRET: string;
  THREADSIQ_STORE: KVNamespace;
}

// Unicode-safe base64 encode
function base64Encode(str: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

// Generate referral code from user ID + secret
async function generateReferralCode(userId: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(userId + secret);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.substring(0, 8);
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const url = new URL(context.request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code) {
      return Response.redirect('https://threads-iq.pages.dev/login?error=no_code', 302);
    }

    // Decode state to get ref code
    let refCode: string | null = null;
    if (state) {
      try {
        const stateObj = JSON.parse(atob(state));
        refCode = stateObj.ref || null;
      } catch (e) {
        console.error('Failed to parse state:', e);
      }
    }

    // Exchange code for token (LINE requires client_id/secret in body, not Basic Auth)
    const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'https://threads-iq.pages.dev/auth/callback',
        client_id: context.env.LINE_CHANNEL_ID,
        client_secret: context.env.LINE_CHANNEL_SECRET,
      }),
    });

    const tokenData: any = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error('Token exchange failed:', JSON.stringify(tokenData));
      return Response.redirect('https://threads-iq.pages.dev/login?error=token_failed', 302);
    }

    // Get user profile
    const profileRes = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile: any = await profileRes.json();

    if (!profile.userId) {
      console.error('Failed to get profile:', JSON.stringify(profile));
      return Response.redirect('https://threads-iq.pages.dev/login?error=profile_failed', 302);
    }

    // Save/update user in KV
    try {
      const existingStr = await context.env.THREADSIQ_STORE.get(`user:${profile.userId}`);
      let userData: any = {
        lineUserId: profile.userId,
        displayName: profile.displayName || 'User',
        pictureUrl: profile.pictureUrl || '',
        createdAt: new Date().toISOString(),
        weeklyUses: 0,
        weeklyResetAt: new Date().toISOString(),
        bonusUses: 0,
        referralCode: '',
        referredBy: null,
        totalReferrals: 0,
        commissionBalance: 0,
        isPaid: false,
      };

      const isNewUser = !existingStr;

      if (existingStr) {
        const existing = JSON.parse(existingStr);
        userData.weeklyUses = existing.weeklyUses || 0;
        userData.weeklyResetAt = existing.weeklyResetAt || new Date().toISOString();
        userData.bonusUses = existing.bonusUses || 0;
        userData.createdAt = existing.createdAt;
        userData.referralCode = existing.referralCode || '';
        userData.referredBy = existing.referredBy || null;
        userData.totalReferrals = existing.totalReferrals || 0;
        userData.commissionBalance = existing.commissionBalance || 0;
        userData.isPaid = existing.isPaid || false;
      }

      // Generate referral code if new user or doesn't have one
      if (!userData.referralCode) {
        userData.referralCode = await generateReferralCode(profile.userId, context.env.LINE_CHANNEL_SECRET);
      }

      // Handle referral logic for new users
      if (isNewUser && refCode) {
        // Look up referrer by ref code
        const referrerId = await context.env.THREADSIQ_STORE.get(`ref:${refCode}`);
        
        if (referrerId && referrerId !== profile.userId) {
          // Set new user's referredBy and bonus
          userData.referredBy = referrerId;
          userData.bonusUses = (userData.bonusUses || 0) + 10;

          // Update referrer's stats
          const referrerStr = await context.env.THREADSIQ_STORE.get(`user:${referrerId}`);
          if (referrerStr) {
            const referrerData = JSON.parse(referrerStr);
            referrerData.bonusUses = (referrerData.bonusUses || 0) + 10;
            referrerData.totalReferrals = (referrerData.totalReferrals || 0) + 1;
            
            // Add to referrer's referral list
            const referralListKey = `referrals:${referrerId}`;
            const referralListStr = await context.env.THREADSIQ_STORE.get(referralListKey);
            let referralList: any[] = [];
            if (referralListStr) {
              referralList = JSON.parse(referrerListStr);
            }
            referralList.push({
              userId: profile.userId,
              displayName: profile.displayName || 'User',
              joinedAt: new Date().toISOString(),
              isPaid: false,
            });
            
            await context.env.THREADSIQ_STORE.put(referralListKey, JSON.stringify(referralList));
            await context.env.THREADSIQ_STORE.put(`user:${referrerId}`, JSON.stringify(referrerData));
          }

          console.log(`Referral applied: ${refCode} -> ${profile.userId}`);
        }
      }

      await context.env.THREADSIQ_STORE.put(`user:${profile.userId}`, JSON.stringify(userData));

      // Store ref lookup for the user
      if (userData.referralCode) {
        await context.env.THREADSIQ_STORE.put(`ref:${userData.referralCode}`, profile.userId);
      }
    } catch (kvError) {
      // KV might not be bound yet, continue without saving
      console.error('KV error (non-fatal):', kvError);
    }

    // Create JWT-like token
    const payload = {
      sub: profile.userId,
      name: profile.displayName || 'User',
      pic: profile.pictureUrl || '',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 30 * 24 * 3600, // 30 days
    };

    const payloadStr = base64Encode(JSON.stringify(payload));

    // Sign with HMAC-SHA256
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(context.env.LINE_CHANNEL_SECRET),
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
    const sigStr = btoa(sigBinary);
    const token = `${payloadStr}.${sigStr}`;

    // Redirect to frontend with token
    return Response.redirect(`https://threads-iq.pages.dev/auth/success#token=${encodeURIComponent(token)}`, 302);
  } catch (error) {
    console.error('Callback error:', error);
    return Response.redirect(`https://threads-iq.pages.dev/login?error=unknown&detail=${encodeURIComponent(String(error))}`, 302);
  }
};
