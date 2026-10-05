// FocusiQ (focusiq-code-sign-in): swap a one-time sign-in code (made by a Director in the Staff tab)
// for a sign-in. Returns a single-use token that the app exchanges with
// supabase.auth.verifyOtp({ token_hash, type: 'magiclink' }). No email is sent.
//
// Deployed with --no-verify-jwt: the caller is not signed in yet, and the code
// is the credential. focusiq.redeem_sign_in_code() only lets a code work once,
// within 12 hours, and only for an active FocusiQ person with a login.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY – provided by Supabase.
//          FOCUSIQ_APP_ORIGINS (optional) – comma-separated origins allowed to call
//          this function (default https://focus-iq.netlify.app).
// Never log codes, email addresses or ids.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const env = (k: string) => Deno.env.get(k) ?? '';
const ORIGINS = (env('FOCUSIQ_APP_ORIGINS') || 'https://focus-iq.netlify.app').split(',').map((s) => s.trim());

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0]!,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    Vary: 'Origin',
  };
}

const NOT_VALID = 'That code is not valid, has expired or has already been used. Please ask for a new one.';

Deno.serve(async (req) => {
  const headers = cors(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405, headers });

  let code = '';
  try {
    code = String(((await req.json()) as { code?: unknown }).code ?? '');
  } catch {
    /* empty or not JSON */
  }
  if (code.replace(/[^A-Za-z0-9]/g, '').length !== 10) return Response.json({ error: NOT_VALID }, { status: 400, headers });

  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const { data: login, error } = await admin.schema('focusiq').rpc('redeem_sign_in_code', { p_code: code });
  if (error) {
    console.error(`focusiq-code-sign-in: redeem failed – ${error.message}`);
    return Response.json({ error: 'Sign-in is not available just now. Please try again.' }, { status: 500, headers });
  }
  if (!login) return Response.json({ error: NOT_VALID }, { status: 400, headers });

  const { data: user, error: userError } = await admin.auth.admin.getUserById(login as string);
  const email = user?.user?.email;
  if (userError || !email) {
    console.error('focusiq-code-sign-in: login has no email');
    return Response.json({ error: 'This code could not sign you in. Please ask for a new one.' }, { status: 500, headers });
  }
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    console.error(`focusiq-code-sign-in: could not make a sign-in token – ${linkError?.message ?? 'no token'}`);
    return Response.json({ error: 'This code could not sign you in. Please ask for a new one.' }, { status: 500, headers });
  }
  return Response.json({ token_hash: tokenHash }, { headers });
});
