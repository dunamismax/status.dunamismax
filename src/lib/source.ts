import type pg from 'pg';
import { snapshot, timestamp, type Snapshot, type Incident, type Maintenance, type Deployment } from './model.js';
export interface Source { latest(): Promise<Snapshot | null>; ping(): Promise<void>; incidents(): Promise<Incident[]>; maintenance(): Promise<Maintenance[]>; deployments(): Promise<Deployment[]> }
export class PostgresSource implements Source {
  constructor(private pool: pg.Pool) {}
  async ping() { await this.pool.query('SELECT 1'); }
  async latest(): Promise<Snapshot | null> {
    const {rows} = await this.pool.query<{snapshot: Snapshot}>('SELECT snapshot FROM app.rollups ORDER BY checked_at DESC,id DESC LIMIT 1');
    const s=rows[0]?.snapshot; return s ? snapshot(s.services, s.projects, s.checked_at) : null;
  }
  async incidents(): Promise<Incident[]> {
    const {rows} = await this.pool.query<Incident>('SELECT title,affected_targets,state,started_at,resolved_at,public_notes FROM app.incidents ORDER BY started_at DESC,id DESC LIMIT 25');
    return rows.map(r=>({...r, started_at:timestamp(r.started_at), resolved_at:r.resolved_at ? timestamp(r.resolved_at):null}));
  }
  async maintenance(): Promise<Maintenance[]> {
    const {rows} = await this.pool.query<Maintenance>("SELECT title,affected_targets,state,starts_at,ends_at,public_notes FROM app.maintenance_windows WHERE ends_at >= now()-interval '30 days' ORDER BY starts_at DESC,id DESC LIMIT 25");
    return rows.map(r=>({...r,starts_at:timestamp(r.starts_at),ends_at:timestamp(r.ends_at)}));
  }
  async deployments(): Promise<Deployment[]> {
    const {rows} = await this.pool.query<Deployment>('SELECT service_id,repo_name,commit_sha,environment,deployed_at,public_summary FROM app.deployment_events ORDER BY deployed_at DESC,id DESC LIMIT 50');
    return rows.map(r=>({...r,deployed_at:timestamp(r.deployed_at)}));
  }
}
