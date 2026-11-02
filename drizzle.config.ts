// Generation/check only: no credentials. Never `push`; reviewed SQL is applied
// by the owner-only runner (build/src/db/migrate.js) under the deploy lock.
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  schemaFilter: ['app'],
  migrations: { schema: 'app', table: 'drizzle_migrations' },
  strict: true,
  verbose: true,
});
