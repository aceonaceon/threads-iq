interface Env {
  THREADSIQ_STORE: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    // Get LINE user ID from JWT token
    const authHeader = context.request.headers.get('Authorization');
    let lineUserId = '';
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const parts = token.split('.');
        if (parts.length >= 2) {
          // Token format is payload.signature (2-part JWT)
          const payload = JSON.parse(atob(parts[0]));
          lineUserId = payload.sub || '';
        }
      } catch (e) {
        console.error('Failed to decode JWT:', e);
      }
    }

    if (!lineUserId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if Threads token exists
    const tokenStr = await context.env.THREADSIQ_STORE.get(`threads_token:${lineUserId}`);
    
    if (!tokenStr) {
      return new Response(JSON.stringify({
        connected: false,
        threadsUserId: null,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const tokenData = JSON.parse(tokenStr);
    
    // Check if token is expired
    const isExpired = tokenData.expiresAt && Date.now() > tokenData.expiresAt;

    return new Response(JSON.stringify({
      connected: !isExpired,
      threadsUserId: tokenData.threadsUserId || null,
      expiresAt: tokenData.expiresAt,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Status check error:', error);
    return new Response(JSON.stringify({ error: 'check_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
