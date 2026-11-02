// Structural catalog of schema `app`, used to adopt an existing database only
// when it exactly matches the reviewed baseline. Sequence positions, row data
// and role-specific ACL text are excluded; access is checked as policy below.
import type pg from 'pg';

export const roles = { owner: 'status_dunamismax_owner', web: 'status_dunamismax_web', collector: 'status_dunamismax_collector' } as const;
export const bookkeeping = 'drizzle_migrations';
export const history = ['targets', 'check_runs', 'rollups', 'incidents', 'maintenance_windows', 'deployment_events', 'alert_notifications'] as const;
export const webReadable = ['rollups', 'incidents', 'maintenance_windows', 'deployment_events'] as const;

const queries = {
  schema: `SELECT n.nspname AS name, pg_get_userbyid(n.nspowner) AS owner FROM pg_namespace n WHERE n.nspname='app'`,
  relations: `SELECT c.relname AS name, c.relkind::text AS kind, pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='app' AND c.relkind IN ('r','p','v','m','S','f') AND c.relname NOT IN ($1::text, $1::text || '_id_seq') ORDER BY 1`,
  columns: `SELECT c.relname AS table, a.attnum AS position, a.attname AS name, format_type(a.atttypid,a.atttypmod) AS type, a.attnotnull AS not_null,
    a.attidentity::text AS identity, pg_get_expr(d.adbin,d.adrelid) AS default, coll.collname AS collation
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum LEFT JOIN pg_collation coll ON coll.oid=a.attcollation AND a.attcollation<>0
    WHERE n.nspname='app' AND c.relkind='r' AND c.relname<>$1::text AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1,2`,
  constraints: `SELECT c.relname AS table, k.conname AS name, k.contype::text AS type, pg_get_constraintdef(k.oid) AS definition
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='app' AND c.relname<>$1::text ORDER BY 1,2`,
  indexes: `SELECT tablename AS table, indexname AS name, indexdef AS definition FROM pg_indexes WHERE schemaname='app' AND tablename<>$1::text ORDER BY 1,2`,
  sequences: `SELECT c.relname AS name, format_type(s.seqtypid,NULL) AS type, s.seqstart::text AS start, s.seqincrement::text AS increment, s.seqmin::text AS min,
    s.seqmax::text AS max, s.seqcache::text AS cache, s.seqcycle AS cycle, dep.refobjsubid AS owned_column, t.relname AS owned_by
    FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_depend dep ON dep.objid=c.oid AND dep.classid='pg_class'::regclass AND dep.deptype IN ('a','i') LEFT JOIN pg_class t ON t.oid=dep.refobjid
    WHERE n.nspname='app' AND c.relname<>$1::text || '_id_seq' ORDER BY 1`,
  triggers: `SELECT c.relname AS table, t.tgname AS name, pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND NOT t.tgisinternal ORDER BY 1,2`,
  functions: `SELECT p.proname AS name, pg_get_function_identity_arguments(p.oid) AS arguments, pg_get_userbyid(p.proowner) AS owner,
    pg_get_functiondef(p.oid) AS definition, has_function_privilege('public', p.oid, 'EXECUTE') AS public_execute
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' ORDER BY 1,2`,
} as const;

export type Catalog = Record<keyof typeof queries, unknown[]>;

// pg_dump/pg_restore re-parses `col IN (...)` checks from
// `(ARRAY['a'::character varying])::text[]` into the equivalent
// `ARRAY[('a'::character varying)::text]`; compare the restored (fixpoint) form.
export const normalizeCheck = (definition: string) => definition.replace(/\(ARRAY\[((?:'(?:[^']|'')*'::character varying(?:, )?)+)\]\)::text\[\]/g,
  (_, items: string) => 'ARRAY[' + (items.match(/'(?:[^']|'')*'::character varying/g) ?? []).map(i => `(${i})::text`).join(', ') + ']');

export async function catalog(db: pg.ClientBase): Promise<Catalog> {
  const result: Partial<Catalog> = {};
  // Deparsed definitions depend on search_path; always schema-qualify them.
  const { rows: [path] } = await db.query<{ search_path: string }>('SHOW search_path');
  await db.query('SET search_path = pg_catalog');
  try {
    for (const [key, text] of Object.entries(queries) as [keyof typeof queries, string][]) {
      const { rows } = await db.query(text, text.includes('$1') ? [bookkeeping] : []);
      result[key] = key === 'constraints' ? rows.map(r => r.type === 'c' ? { ...r, definition: normalizeCheck(r.definition) } : r) : rows;
    }
  } finally { await db.query("SELECT set_config('search_path', $1, false)", [path?.search_path ?? '"$user", public']); }
  return result as Catalog;
}

/** Differences between two catalogs as stable JSON lines; empty means identical. */
export function differences(expected: Catalog, actual: Catalog): string[] {
  const out: string[] = [];
  for (const key of Object.keys(queries) as (keyof typeof queries)[]) {
    const want = new Set(expected[key].map(v => JSON.stringify(v))), have = new Set(actual[key].map(v => JSON.stringify(v)));
    for (const v of want) if (!have.has(v)) out.push(`missing ${key} ${v}`);
    for (const v of have) if (!want.has(v)) out.push(`unexpected ${key} ${v}`);
  }
  return out;
}

/** Actual grants, not ORM conventions: violations of the read/write boundary. */
export async function accessViolations(db: pg.ClientBase): Promise<string[]> {
  const { rows } = await db.query<{ violation: string }>(`
    WITH p AS (SELECT $1::text[] AS readable, $2::name AS web, $3::name AS collector, $4::name AS owner, $5::text AS book),
    r AS (SELECT c.oid, c.relname::text AS relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relkind IN ('r','p','v','m','S','f')),
    private AS (SELECT r.* FROM r, p WHERE r.relname IN ('schema_migrations', p.book, p.book || '_id_seq'))
    SELECT 'web may read ' || relname AS violation FROM r, p WHERE relkind<>'S' AND relname<>ALL(p.readable) AND has_table_privilege(p.web, oid, 'SELECT')
    UNION ALL SELECT 'web cannot read ' || relname FROM r, p WHERE relname=ANY(p.readable) AND NOT has_table_privilege(p.web, oid, 'SELECT')
    UNION ALL SELECT 'web may write ' || relname FROM r, p WHERE relkind<>'S' AND has_table_privilege(p.web, oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    UNION ALL SELECT 'web may use sequence ' || relname FROM r, p WHERE relkind='S' AND has_sequence_privilege(p.web, oid, 'USAGE,SELECT,UPDATE')
    UNION ALL SELECT 'collector may access ' || relname FROM private, p WHERE CASE WHEN relkind='S' THEN has_sequence_privilege(p.collector, oid, 'USAGE,SELECT,UPDATE')
      ELSE has_table_privilege(p.collector, oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') END
    UNION ALL SELECT 'public may access ' || relname FROM private, p WHERE CASE WHEN relkind='S' THEN has_sequence_privilege('public', oid, 'USAGE,SELECT,UPDATE')
      ELSE has_table_privilege('public', oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') END
    UNION ALL SELECT 'web may create in schema app' FROM p WHERE has_schema_privilege(p.web, 'app', 'CREATE')
    UNION ALL SELECT 'collector may create in schema app' FROM p WHERE has_schema_privilege(p.collector, 'app', 'CREATE')
    UNION ALL SELECT m.role || ' is a member of ' || m.target FROM p, LATERAL (VALUES (p.web, p.owner), (p.web, p.collector), (p.collector, p.owner)) m(role, target) WHERE pg_has_role(m.role, m.target, 'MEMBER')
    UNION ALL SELECT 'future owner objects default to web access' FROM p, pg_default_acl d, aclexplode(d.defaclacl) a
      WHERE d.defaclrole=(SELECT oid FROM pg_roles WHERE rolname=p.owner) AND d.defaclobjtype IN ('r','S') AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname=p.web)
    ORDER BY 1`, [webReadable, roles.web, roles.collector, roles.owner, bookkeeping]);
  return rows.map(r => r.violation);
}
