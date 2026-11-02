// Owner-only migration runner. Never imported by web or collector code and
// never run on startup. One connection, one transaction, SET LOCAL ROLE owner.
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { catalog, differences, accessViolations, roles, bookkeeping, history, type Catalog } from './catalog.js';

export const folder = fileURLToPath(new URL('../../../drizzle', import.meta.url));
export interface Outcome { applied: string[]; adopted: string | null }

function journal(dir: string) {
  const tags = (JSON.parse(readFileSync(dir + '/meta/_journal.json', 'utf8')) as { entries: { tag: string }[] }).entries.map(e => e.tag);
  return readMigrationFiles({ migrationsFolder: dir }).map((m, i) => ({ ...m, tag: tags[i]! }));
}

/** Applies pending reviewed migrations. `adopt` records the baseline as already
 * applied, without executing it, only when the existing catalog matches exactly. */
export async function migrate(db: pg.ClientBase, options: { adopt?: boolean; dir?: string } = {}): Promise<Outcome> {
  const dir = options.dir ?? folder, migrations = journal(dir), outcome: Outcome = { applied: [], adopted: null };
  const baseline = migrations[0];
  if (!baseline) throw new Error('No reviewed migrations found');
  await db.query('BEGIN');
  try {
    await db.query(`SET LOCAL ROLE ${roles.owner}`);
    await db.query("SET LOCAL lock_timeout = '10s'");
    await db.query('SELECT pg_advisory_xact_lock(193701, 2)');
    const { rows: [state] } = await db.query<{ schema: boolean; journal: boolean; tables: number }>(
      `SELECT to_regnamespace('app') IS NOT NULL AS schema, to_regclass('app.' || $1::text) IS NOT NULL AS journal,
       (SELECT count(*)::int FROM unnest($2::text[]) t WHERE to_regclass('app.' || t) IS NOT NULL) AS tables`, [bookkeeping, [...history, 'schema_migrations']]);
    if (!state?.schema) throw new Error('Schema app must be provisioned before migration');
    if (!state.journal) {
      if (options.adopt) {
        const expected = JSON.parse(readFileSync(dir + '/baseline-catalog.json', 'utf8')) as Catalog;
        const diff = differences(expected, await catalog(db));
        if (diff.length) throw new Error('Existing schema does not match the reviewed baseline:\n' + diff.join('\n'));
      } else if (state.tables > 0) throw new Error('Existing schema has no Drizzle journal; adopt it explicitly with --adopt-baseline');
      // Same shape as Drizzle's journal; private to the owner like app.schema_migrations.
      await db.query(`CREATE TABLE app.${bookkeeping} (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`);
      await db.query(`REVOKE ALL ON TABLE app.${bookkeeping} FROM PUBLIC, ${roles.web}, ${roles.collector}`);
      await db.query(`REVOKE ALL ON SEQUENCE app.${bookkeeping}_id_seq FROM PUBLIC, ${roles.web}, ${roles.collector}`);
      if (options.adopt) {
        await db.query(`INSERT INTO app.${bookkeeping}(hash, created_at) VALUES ($1, $2)`, [baseline.hash, baseline.folderMillis]);
        outcome.adopted = baseline.tag;
      }
    } else if (options.adopt) throw new Error('Baseline already recorded; run without --adopt-baseline');
    const { rows: done } = await db.query<{ hash: string; created_at: string }>(`SELECT hash, created_at::text FROM app.${bookkeeping} ORDER BY created_at, id`);
    // Applied history must be an exact prefix of the reviewed journal.
    if (done.length > migrations.length || done.some((row, i) => row.hash !== migrations[i]!.hash || row.created_at !== String(migrations[i]!.folderMillis)))
      throw new Error('Recorded migrations differ from the reviewed journal');
    for (const m of migrations.slice(done.length)) {
      for (const statement of m.sql) if (statement.trim()) await db.query(statement);
      await db.query(`INSERT INTO app.${bookkeeping}(hash, created_at) VALUES ($1, $2)`, [m.hash, m.folderMillis]);
      outcome.applied.push(m.tag);
    }
    const violations = await accessViolations(db);
    if (violations.length) throw new Error('Access boundary violated:\n' + violations.join('\n'));
    await db.query('COMMIT');
    return outcome;
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}

async function main(args: string[]) {
  if (args.some(a => a !== '--adopt-baseline')) throw new Error('Usage: migrate [--adopt-baseline]');
  if (process.env.STATUS_ENV_FILE) process.loadEnvFile(process.env.STATUS_ENV_FILE);
  const env = process.env;
  if (!env.PGDATABASE || !env.PGUSER || env.PGUSER === roles.web || env.PGUSER === roles.collector) throw new Error('Use the migration login');
  const db = new pg.Client({ host: env.PGHOST || '127.0.0.1', port: Number(env.PGPORT || 5432), database: env.PGDATABASE, user: env.PGUSER, password: env.PGPASSWORD, connectionTimeoutMillis: 3000, statement_timeout: 120000, application_name: 'status-dunamismax-migrate' });
  await db.connect();
  try {
    const result = await migrate(db, { adopt: args.includes('--adopt-baseline') });
    console.log(`migrations: adopted=${result.adopted ?? 'none'} applied=${result.applied.join(',') || 'none'}`);
  } finally { await db.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main(process.argv.slice(2)).catch((error: unknown) => {
  // Catalog differences are private schema metadata for the root operator, never public output.
  console.error('Migration failed; transaction rolled back.' + (error instanceof Error && /baseline|journal|boundary|provisioned|adopt|migration login|Usage/.test(error.message) ? '\n' + error.message : ''));
  process.exitCode = 1;
});
