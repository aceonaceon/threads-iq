interface Env {
  META_APP_ID: string;
  META_APP_SECRET: string;
  THREADSIQ_STORE: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { META_APP_ID } = context.env;
  
  if (!META_APP_ID) {
    return new Response(JSON.stringify({ error: 'Meta app not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const redirectUri = 'https://threads-iq.pages.dev/api/auth/threads/callback';
  
  // Get LINE user ID from query param (frontend passes the JWT token)
  const url = new URL(context.request.url);
  const token = url.searchParams.get('token') || '';
  let lineUserId = '';
  
  if (token) {
    try {
      const parts = token.split('.');
      if (parts.length >= 2) {
        // Unicode-safe base64 decode
        const binary = atob(parts[0]);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const decoded = new TextDecoder().decode(bytes);
        const payload = JSON.parse(decoded);
        lineUserId = payload.sub || '';
      }
    } catch (e) {
      console.error('Failed to decode token:', e);
    }
  }

  if (!lineUserId) {
    return new Response(JSON.stringify({ error: '請先登入 LINE' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Build state object (include LINE JWT token for session recovery after redirect)
  const stateObj = {
    lineUserId,
    lineToken: token,
    csrf: crypto.randomUUID(),
  };
  const state = btoa(JSON.stringify(stateObj));
  
  // Build Meta OAuth URL for Threads
  const scopes = [
    'threads_basic',
    'threads_content_publish',
    'threads_manage_insights',
    'threads_manage_replies',
  ].join(',');
  
  const metaUrl = new URL('https://www.threads.net/oauth/authorize');
  metaUrl.searchParams.set('client_id', META_APP_ID);
  metaUrl.searchParams.set('redirect_uri', redirectUri);
  metaUrl.searchParams.set('scope', scopes);
  metaUrl.searchParams.set('response_type', 'code');
  metaUrl.searchParams.set('state', state);

  return Response.redirect(metaUrl.toString(), 302);
};
