interface Env {
  LINE_CHANNEL_ID: string;
  LINE_CHANNEL_SECRET: string;
  THREADSIQ_STORE: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { LINE_CHANNEL_ID } = context.env;
  const redirectUri = 'https://threads-iq.pages.dev/auth/callback';
  
  // Check for ref parameter from query string
  const url = new URL(context.request.url);
  const refCode = url.searchParams.get('ref');
  
  // Generate state with optional ref code
  const stateObj = {
    csrf: crypto.randomUUID(),
    ref: refCode || null,
  };
  const state = btoa(JSON.stringify(stateObj));
  
  const lineUrl = new URL('https://access.line.me/oauth2/v2.1/authorize');
  lineUrl.searchParams.set('response_type', 'code');
  lineUrl.searchParams.set('client_id', LINE_CHANNEL_ID);
  lineUrl.searchParams.set('redirect_uri', redirectUri);
  lineUrl.searchParams.set('state', state);
  lineUrl.searchParams.set('scope', 'profile openid');
  lineUrl.searchParams.set('bot_prompt', 'aggressive');
  
  return Response.redirect(lineUrl.toString(), 302);
};
