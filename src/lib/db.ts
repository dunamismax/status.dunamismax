import pg from 'pg';
// Keep PostgreSQL's full microsecond precision rather than Date's milliseconds.
pg.types.setTypeParser(1184, (v: string) => v.replace(' ','T').replace(/\+00$/, 'Z'));
pg.types.setTypeParser(20, (v: string) => v); // historical bigint IDs stay lossless
export function database(env: NodeJS.ProcessEnv = process.env): pg.Pool {
  return new pg.Pool({ host: env.PGHOST || '127.0.0.1', port: Number(env.PGPORT || 5432), database: env.PGDATABASE, user: env.PGUSER, password: env.PGPASSWORD, max: 3, connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000, statement_timeout: 30000, application_name: 'status-dunamismax' });
}
