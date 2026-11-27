/**
 * Promote ONE existing Supabase auth user to SUPER_ADMIN.
 *
 *   DATABASE_URL=… npm run db:bootstrap-super-admin -- someone@example.com
 *
 * Refuses (exit 1, nothing written) when a SUPER_ADMIN already exists, when the
 * email matches no auth user or more than one, or when the profile is
 * deactivated. Writes the grant and its audit row (actor_id NULL) in one
 * transaction. See server/auth/bootstrap.ts for the rules.
 *
 * Runs under plain Node 22 (built-in TypeScript type stripping), so every
 * import in its graph is a relative `.ts` path.
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../lib/generated/prisma/client.ts';
import { requireDatabaseUrl } from '../../lib/env.ts';
import { BootstrapRefusedError, bootstrapSuperAdmin } from '../../server/auth/bootstrap.ts';

async function main(argv: readonly string[]): Promise<number> {
  const args = argv.filter((a) => a !== '--');
  if (args.length !== 1 || args[0] === undefined) {
    console.error('usage: npm run db:bootstrap-super-admin -- <email>');
    return 2;
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: requireDatabaseUrl() }),
  });
  try {
    const result = await bootstrapSuperAdmin(prisma, args[0]);
    console.log(
      `OK: user ${result.userId} is now SUPER_ADMIN` +
        (result.profileCreated
          ? ' (profile created with the default STUDENT role; 2 audit rows written)'
          : ' (1 audit row written)') +
        '.',
    );
    return 0;
  } catch (error) {
    if (error instanceof BootstrapRefusedError) {
      console.error(`REFUSED (${error.reason}): ${error.message} Nothing was written.`);
      return 1;
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
