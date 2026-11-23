import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

/**
 * Next.js 16 "proxy" (previously "middleware"). Refreshes the Supabase
 * session cookie on matched requests. No authorization decisions are made
 * here; protected routes and server actions re-verify the user server-side
 * (README §7.7, docs/security/authentication.md).
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Skip static assets and image optimization; run on pages and route handlers.
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
