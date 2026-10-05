/// <reference types="vite/client" />
/**
 * Live mode: the apps talk to WG Main when the build is given its address and
 * publishable (anon) key, e.g. in Netlify's environment variables:
 *
 *   VITE_SUPABASE_URL       https://<project>.supabase.co
 *   VITE_SUPABASE_ANON_KEY  the project's publishable key (safe to publish:
 *                           row-level security decides what anyone can see)
 *
 * Without them the apps run the demo, with made-up data kept in the browser.
 * Every query uses the `focusiq` schema; sign-ins are shared with the other WG
 * apps, so access is always decided by focusiq.is_focusiq_user() /
 * focusiq.is_director(), never by being signed in.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const LIVE = Boolean(url && key);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;
let client: Client | null = null;

/** The live client (focusiq schema). Only call in live mode. */
export function db(): Client {
  if (!LIVE) throw new Error('FocusiQ is running in demo mode.');
  client ??= createClient(url!, key!, {
    db: { schema: 'focusiq' },
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  });
  return client!;
}

/** Throws a plain-English error for a failed call; never includes personal data. */
export function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
