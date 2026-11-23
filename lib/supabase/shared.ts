import { parsePublicEnv } from '@/lib/env';

/**
 * Shared Supabase configuration used by the browser client, the server client
 * and the proxy session refresh. Both values are public-by-design (the
 * anon key is constrained by Postgres RLS, not by secrecy) — but the app must
 * still render/build before any Supabase project exists, so configuration is
 * optional until credentials are provisioned. When absent, auth calls are
 * skipped gracefully and logged on the server.
 */
export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export function getSupabaseConfig(
  input?: Record<string, string | undefined>,
): SupabaseConfig | null {
  const env = parsePublicEnv(input ?? process.env);
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }
  return { url: env.NEXT_PUBLIC_SUPABASE_URL, anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}
