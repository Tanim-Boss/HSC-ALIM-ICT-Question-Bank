import 'server-only';

import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/**
 * Server-side authentication utilities.
 *
 * `getUser` returns the Supabase-verified user for the current request, or
 * null when there is no valid session (or Supabase is not configured).
 * Authorization (what that user may do) is a separate concern enforced by the
 * domain services and the authorization policy — never by hidden UI state.
 */
export async function getUser(): Promise<User | null> {
  const supabase = await createClient();
  if (!supabase) {
    return null;
  }
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return null;
  }
  return user;
}

/** True when the current request carries a verified Supabase session. */
export async function isAuthenticated(): Promise<boolean> {
  return (await getUser()) !== null;
}
