import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseConfig } from '@/lib/supabase/shared';

/**
 * Session management foundation for the Next.js proxy (middleware) chain.
 *
 * Refreshes the Supabase auth session cookies on every matched request so
 * server components always observe a valid session. When Supabase is not
 * configured, the request passes through untouched (development shell before
 * credentials are provisioned) and a one-time server-side warning is logged.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const config = getSupabaseConfig();
  if (!config) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(
        '[ict-atlas] Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY). Auth session refresh is disabled.',
      );
    }
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Validate (and, when needed, refresh) the session. Do not make
  // authorization decisions here — protected routes re-check on the server.
  await supabase.auth.getUser();

  return response;
}
