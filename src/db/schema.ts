// Typed mirror of the reviewed `app` schema. Grants, triggers and bookkeeping
// live in the reviewed SQL under drizzle/; declarations never imply access.
// Column keys keep their database names so read models stay byte-compatible.
import { sql } from 'drizzle-orm';
import { pgSchema, varchar, bigint, integer, text, jsonb, timestamp, check, foreignKey, index } from 'drizzle-orm/pg-core';
import type { Snapshot, State } from '../lib/model.js';

export const app = pgSchema('app');
// Microsecond history stays PostgreSQL text; JS Date would truncate it.
const at = (name: string) => timestamp(name, { withTimezone: true, precision: 6, mode: 'string' });
const now6 = sql`CURRENT_TIMESTAMP(6)`;
const id = () => bigint('id', { mode: 'bigint' }).primaryKey().generatedByDefaultAsIdentity();

export const targets = app.table('targets', {
  id: varchar('id', { length: 128 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  target_kind: varchar('target_kind', { length: 32 }).notNull(),
  group_name: varchar('group_name', { length: 128 }),
  public_url: varchar('public_url', { length: 512 }),
  probe_url: varchar('probe_url', { length: 512 }),
  repo_name: varchar('repo_name', { length: 255 }),
  first_seen_at: at('first_seen_at').notNull(),
  last_seen_at: at('last_seen_at').notNull(),
});

export const checkRuns = app.table('check_runs', {
  id: id(),
  target_id: varchar('target_id', { length: 128 }).notNull(),
  check_kind: varchar('check_kind', { length: 32 }).notNull(),
  state: varchar('state', { length: 16 }).$type<State>().notNull(),
  checked_at: at('checked_at').notNull(),
  // Bounded probe latency in milliseconds; never an identifier.
  latency_ms: bigint('latency_ms', { mode: 'number' }),
  reason: text('reason').notNull(),
  probe_version: varchar('probe_version', { length: 64 }).notNull(),
  public_payload: jsonb('public_payload').notNull(),
  inserted_at: at('inserted_at').notNull().default(now6),
}, t => [
  foreignKey({ name: 'check_runs_target_fk', columns: [t.target_id], foreignColumns: [targets.id] }).onDelete('cascade'),
  check('check_runs_state_check', sql`${t.state} IN ('operational', 'degraded', 'down', 'maintenance', 'unknown')`),
  index('check_runs_target_checked_at_idx').on(t.target_id, t.checked_at),
  index('check_runs_retention_idx').on(t.checked_at),
]);

export const rollups = app.table('rollups', {
  id: id(),
  overall_state: varchar('overall_state', { length: 16 }).$type<State>().notNull(),
  checked_at: at('checked_at').notNull(),
  operational_count: integer('operational_count').notNull(),
  degraded_count: integer('degraded_count').notNull(),
  down_count: integer('down_count').notNull(),
  maintenance_count: integer('maintenance_count').notNull(),
  unknown_count: integer('unknown_count').notNull(),
  snapshot: jsonb('snapshot').$type<Snapshot>().notNull(),
  inserted_at: at('inserted_at').notNull().default(now6),
}, t => [
  check('rollups_state_check', sql`${t.overall_state} IN ('operational', 'degraded', 'down', 'maintenance', 'unknown')`),
  index('rollups_checked_at_idx').on(t.checked_at),
]);

export const incidents = app.table('incidents', {
  id: id(),
  title: varchar('title', { length: 255 }).notNull(),
  affected_targets: jsonb('affected_targets').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  state: varchar('state', { length: 16 }).notNull(),
  started_at: at('started_at').notNull(),
  resolved_at: at('resolved_at'),
  public_notes: text('public_notes').notNull().default(''),
  created_at: at('created_at').notNull().default(now6),
  updated_at: at('updated_at').notNull().default(now6),
}, t => [
  check('incidents_state_check', sql`${t.state} IN ('investigating', 'identified', 'monitoring', 'resolved')`),
  check('incidents_resolved_check', sql`${t.resolved_at} IS NULL OR ${t.resolved_at} >= ${t.started_at}`),
  index('incidents_started_at_idx').on(t.started_at),
]);

export const maintenanceWindows = app.table('maintenance_windows', {
  id: id(),
  title: varchar('title', { length: 255 }).notNull(),
  affected_targets: jsonb('affected_targets').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  state: varchar('state', { length: 16 }).notNull(),
  starts_at: at('starts_at').notNull(),
  ends_at: at('ends_at').notNull(),
  public_notes: text('public_notes').notNull().default(''),
  created_at: at('created_at').notNull().default(now6),
  updated_at: at('updated_at').notNull().default(now6),
}, t => [
  check('maintenance_windows_state_check', sql`${t.state} IN ('scheduled', 'in_progress', 'complete', 'canceled')`),
  check('maintenance_windows_range_check', sql`${t.ends_at} >= ${t.starts_at}`),
  index('maintenance_windows_starts_at_idx').on(t.starts_at),
]);

export const deploymentEvents = app.table('deployment_events', {
  id: id(),
  service_id: varchar('service_id', { length: 128 }),
  repo_name: varchar('repo_name', { length: 255 }),
  commit_sha: varchar('commit_sha', { length: 64 }),
  environment: varchar('environment', { length: 64 }).notNull().default('production'),
  deployed_at: at('deployed_at').notNull(),
  public_summary: text('public_summary').notNull().default(''),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  inserted_at: at('inserted_at').notNull().default(now6),
}, t => [
  index('deployment_events_deployed_at_idx').on(t.deployed_at),
]);

export const alertNotifications = app.table('alert_notifications', {
  id: id(),
  dedup_key: varchar('dedup_key', { length: 255 }).notNull(),
  target_id: varchar('target_id', { length: 128 }).notNull(),
  severity: varchar('severity', { length: 16 }).notNull(),
  observed_state: varchar('observed_state', { length: 16 }).notNull(),
  title: varchar('title', { length: 512 }).notNull(),
  public_summary: text('public_summary').notNull(),
  observed_at: at('observed_at').notNull(),
  notification_target: varchar('notification_target', { length: 64 }).notNull(),
  public_payload: jsonb('public_payload').notNull(),
  sent_at: at('sent_at').notNull().default(now6),
}, t => [
  check('alert_notifications_severity_check', sql`${t.severity} IN ('warning', 'critical')`),
  check('alert_notifications_state_check', sql`${t.observed_state} IN ('operational', 'degraded', 'down', 'unknown')`),
  index('alert_notifications_dedup_sent_at_idx').on(t.dedup_key, t.sent_at),
  index('alert_notifications_sent_at_idx').on(t.sent_at),
]);

// Legacy raw-schema bookkeeping, retained for old releases; distinct from
// Drizzle's app.drizzle_migrations journal.
export const schemaMigrations = app.table('schema_migrations', {
  version: integer('version').primaryKey(),
  applied_at: timestamp('applied_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});
