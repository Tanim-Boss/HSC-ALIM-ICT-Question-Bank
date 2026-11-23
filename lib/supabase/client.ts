'use client';

import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseConfig } from '@/lib/supabase/shared';

/**
 * Browser-side Supabase client (Client Components only).
 *
 * Uses the public anon key; Row Level Security on the database remains the
 * enforcement boundary, and server-side authorization is applied on every
 * protected route regardless of what this client can see. The service-role
 * key is server-only and its absence here is a hard rule — never import
 * SUPABASE_SERVICE_ROLE_KEY into browser-reachable modules.
 */
export function createClient() {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example).',
    );
  }
  return createBrowserClient(config.url, config.anonKey);
}
