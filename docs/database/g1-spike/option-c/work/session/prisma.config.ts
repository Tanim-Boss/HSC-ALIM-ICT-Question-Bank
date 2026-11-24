import { defineConfig } from 'prisma/config';
export default defineConfig({
  schema: process.env.G1_OC_SCHEMA,
  migrations: { path: process.env.G1_OC_MIGRATIONS },
});
