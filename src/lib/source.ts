import type pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { desc, gte, sql } from 'drizzle-orm';
// Only the four web-readable models; grants, not this import list, enforce it.
import { rollups, incidents, maintenanceWindows, deploymentEvents } from '../db/schema.js';
import { snapshot, timestamp, type Snapshot, type Incident, type Maintenance, type Deployment } from './model.js';
export interface Source { latest(): Promise<Snapshot | null>; ping(): Promise<void>; incidents(): Promise<Incident[]>; maintenance(): Promise<Maintenance[]>; deployments(): Promise<Deployment[]> }
export class PostgresSource implements Source {
  private db: NodePgDatabase;
  constructor(pool: pg.Pool) { this.db = drizzle({ client: pool }); }
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
