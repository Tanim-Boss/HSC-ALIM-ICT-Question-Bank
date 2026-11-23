import 'server-only';

import { PrismaClient } from '@/lib/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { requireDatabaseUrl } from '@/lib/env';

/**
 * Database access boundary (approved stack: PostgreSQL + Prisma).
 *
 * - The Prisma schema (prisma/schema.prisma) intentionally defines no domain
 *   models yet — the approved documents leave the physical model open
 *   (OD-08 – OD-13, OD-18–OD-21). Do not add models here.
 * - Prisma 7 requires a driver adapter; `@prisma/adapter-pg` connects to the
 *   PostgreSQL server through `pg`.
 * - Server-only: importing this module from a Client Component fails the
 *   build. Route handlers, Server Components and server actions go through
 *   the domain services under server/, which own all queries.
 * - Connection string comes from DATABASE_URL (env) — never hardcode it.
 * - The client is created lazily on first use so that importing this module
 *   (e.g. during `next build` or offline tooling without a database) never
 *   throws. The first actual query fails loudly via requireDatabaseUrl().
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: requireDatabaseUrl() });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

/**
 * Shared Prisma client (lazy singleton).
 *
 * In development, the instance is cached on globalThis so hot-reload does not
 * exhaust database connections. In production a single instance is created
 * per server process.
 */
export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}
