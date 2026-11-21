import type pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, desc, gte, lt, sql } from 'drizzle-orm';
// Only the four web-readable models; grants, not this import list, enforce it.
import { rollups, incidents, maintenanceWindows, deploymentEvents } from '../db/schema.js';
import { addDays, estDay, estDayStart, snapshot, states, timestamp, type DailyCount, type Snapshot, type Incident, type Maintenance, type Deployment, type State } from './model.js';
export interface Source { latest(): Promise<Snapshot | null>; ping(): Promise<void>; incidents(): Promise<Incident[]>; maintenance(): Promise<Maintenance[]>; deployments(): Promise<Deployment[]>; history(days: number, now: number): Promise<DailyCount[]> }
export class PostgresSource implements Source {
  private db: NodePgDatabase;
  // Completed days never change, so they are aggregated once per EST day and
  // window; each request then reads only the current day's rollups.
  private past: { key: string; rows: DailyCount[] } | null = null;
  constructor(pool: pg.Pool) { this.db = drizzle({ client: pool }); }
  async history(days: number, now: number): Promise<DailyCount[]> {
    const today = estDay(now), first = addDays(today, 1 - days), key = first + '/' + today;
    if (this.past?.key !== key) this.past = { key, rows: await this.counts(first, today) };
    return [...this.past.rows, ...await this.counts(today, addDays(today, 1))];
  }
  /** Per-day, per-target state counts for EST days in [from, to). */
  private async counts(from: string, to: string): Promise<DailyCount[]> {
    if (from >= to) return [];
    const day = sql`to_char((${rollups.checked_at} AT TIME ZONE 'UTC') - interval '5 hours', 'YYYY-MM-DD')`;
    const service = sql`jsonb_array_elements(${rollups.snapshot}->'services')`;
    const rows = await this.db.select({ day: sql<string>`${day}`, target_id: sql<string>`s.value->'target'->>'id'`, state: sql<string>`s.value->'check'->>'state'`, samples: sql<number>`count(*)::int` })
      .from(rollups).crossJoinLateral(sql`${service} AS s(value)`)
      .where(and(gte(rollups.checked_at, estDayStart(from)), lt(rollups.checked_at, estDayStart(to))))
      .groupBy(sql`1`, sql`2`, sql`3`);
    return rows.filter((r): r is DailyCount => typeof r.target_id === 'string' && (states as readonly string[]).includes(r.state)).map(r => ({ ...r, state: r.state as State, samples: Number(r.samples) }));
  }
  async ping() { await this.db.execute(sql`SELECT 1`); }
  async latest(): Promise<Snapshot | null> {
    const rows = await this.db.select({ snapshot: rollups.snapshot }).from(rollups).orderBy(desc(rollups.checked_at), desc(rollups.id)).limit(1);
    const s=rows[0]?.snapshot; return s ? snapshot(s.services, s.projects, s.checked_at) : null;
  }
  async incidents(): Promise<Incident[]> {
    const t = incidents;
    const rows = await this.db.select({ title: t.title, affected_targets: t.affected_targets, state: t.state, started_at: t.started_at, resolved_at: t.resolved_at, public_notes: t.public_notes }).from(t).orderBy(desc(t.started_at), desc(t.id)).limit(25);
    return rows.map(r=>({...r, started_at:timestamp(r.started_at), resolved_at:r.resolved_at ? timestamp(r.resolved_at):null}));
  }
  async maintenance(): Promise<Maintenance[]> {
    const t = maintenanceWindows;
    const rows = await this.db.select({ title: t.title, affected_targets: t.affected_targets, state: t.state, starts_at: t.starts_at, ends_at: t.ends_at, public_notes: t.public_notes }).from(t).where(gte(t.ends_at, sql`now()-interval '30 days'`)).orderBy(desc(t.starts_at), desc(t.id)).limit(25);
    return rows.map(r=>({...r,starts_at:timestamp(r.starts_at),ends_at:timestamp(r.ends_at)}));
  }
  async deployments(): Promise<Deployment[]> {
    const t = deploymentEvents;
    const rows = await this.db.select({ service_id: t.service_id, repo_name: t.repo_name, commit_sha: t.commit_sha, environment: t.environment, deployed_at: t.deployed_at, public_summary: t.public_summary }).from(t).orderBy(desc(t.deployed_at), desc(t.id)).limit(50);
    return rows.map(r=>({...r,deployed_at:timestamp(r.deployed_at)}));
  }
}
