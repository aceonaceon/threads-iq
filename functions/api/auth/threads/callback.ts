interface Env {
  META_APP_ID: string;
  META_APP_SECRET: string;
  THREADSIQ_STORE: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const url = new URL(context.request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    // If there's an error from Meta
    if (error) {
      console.error('Meta OAuth error:', error);
      return Response.redirect('https://threads-iq.pages.dev/analyze?threads_auth=error', 302);
    }

    if (!code) {
      return Response.redirect('https://threads-iq.pages.dev/analyze?threads_auth=no_code', 302);
    }

    // Decode state to get LINE user ID
    let lineUserId = '';
    if (state) {
      try {
        const stateObj = JSON.parse(atob(state));
        lineUserId = stateObj.lineUserId || '';
      } catch (e) {
        console.error('Failed to parse state:', e);
      }
    }

    if (!lineUserId) {
      return Response.redirect('https://threads-iq.pages.dev/analyze?threads_auth=no_state', 302);
    }

    // Exchange code for access token
    const tokenRes = await fetch('https://graph.threads.net/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: context.env.META_APP_ID,
        client_secret: context.env.META_APP_SECRET,
        redirect_uri: 'https://threads-iq.pages.dev/api/auth/threads/callback',
        code,
      }),
    });

    const tokenData: any = await tokenRes.json();
    
    if (!tokenData.access_token) {
      console.error('Token exchange failed:', JSON.stringify(tokenData));
      return Response.redirect('https://threads-iq.pages.dev/analyze?threads_auth=token_failed', 302);
    }

    // Get Threads user ID
    let threadsUserId = '';
    try {
      const userRes = await fetch(`https://graph.threads.net/v1.0/me?access_token=${tokenData.access_token}`);
      const userData: any = await userRes.json();
      threadsUserId = userData.id || '';
    } catch (e) {
      console.error('Failed to get Threads user:', e);
    }

    // Store token in KV
    const tokenStore = {
      accessToken: tokenData.access_token,
      threadsUserId,
      expiresAt: tokenData.expires_in 
        ? Date.now() + (tokenData.expires_in * 1000)
        : Date.now() + (60 * 24 * 60 * 60 * 1000), // Default 60 days
      createdAt: new Date().toISOString(),
    };

    await context.env.THREADSIQ_STORE.put(
      `threads_token:${lineUserId}`,
      JSON.stringify(tokenStore)
    );

    console.log(`Threads token stored for user: ${lineUserId}`);

    // Redirect back to analyze page with success
    return Response.redirect('https://threads-iq.pages.dev/analyze?threads_auth=success', 302);
  } catch (error) {
    console.error('Threads callback error:', error);
    return Response.redirect('https://threads-iq.pages.dev/analyze?threads_auth=error', 302);
  }
};
