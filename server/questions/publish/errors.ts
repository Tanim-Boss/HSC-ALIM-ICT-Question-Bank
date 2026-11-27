/**
 * Moved to `server/shared/errors.ts` (Phase 04C) so that `server/auth` does not
 * depend on `server/questions`. This re-export keeps every existing import path
 * working; new code imports from `@/server/shared/errors`.
 */
export * from '@/server/shared/errors';
