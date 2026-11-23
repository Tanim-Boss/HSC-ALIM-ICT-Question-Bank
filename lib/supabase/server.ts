import 'server-only';

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseConfig } from '@/lib/supabase/shared';

/**
 * Server-side Supabase client bound to the current request's cookies
 * (App Router). Use from Server Components, Route Handlers and Server
 * Actions. Session tokens are verified by Supabase — never trust client
 * supplied identity claims.
 *
 * Returns null when Supabase is not configured so unauthenticated public
 * surfaces can render before credentials are provisioned. Protected callers
 * must treat null as "not authenticated".
 */
export async function createClient() {
  const config = getSupabaseConfig();
  if (!config) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component — cookies are read-only there.
          // Session refresh is handled by the proxy; safe to ignore.
        }
      },
    },
  });
}
