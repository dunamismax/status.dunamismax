// Server-side request policy for the SvelteKit app: the public route allowlist,
// response headers, operator bearer check and snapshot loading. Imported only
// by hooks.server.ts and server route modules, never by components.
import { timingSafeEqual } from 'node:crypto';
import { freshness, snapshot, type Freshness, type Snapshot } from './model.js';
import { notice, type Notice } from './view.js';
import type { Config } from './config.js';
import type { Source } from './source.js';

export const routes = ['/', '/services', '/projects', '/incidents', '/deployments', '/operator', '/healthz', '/readyz', '/api/status.json', '/api/incidents.json'];
export const headers: Record<string, string> = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'",
  'Permissions-Policy': 'interest-cohort=()'
};

/** Request-scoped dependencies. Production builds them from the environment; tests inject them through `platform`. */
export interface StatusContext { source: Source; config: Config; now: number }

export type OperatorAccess = 'disabled' | 'denied' | 'granted';
export function operatorAccess(authorization: string | null, token: string | null): OperatorAccess {
  if (!token) return 'disabled';
  const auth = authorization?.trim() ?? '';
  const candidate = auth.startsWith('Bearer ') ? Buffer.from(auth.slice(7)) : Buffer.alloc(0), expected = Buffer.from(token);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected) ? 'granted' : 'denied';
}

export async function readiness(source: Source, c: Config, now = Date.now()) {
  try { await source.ping(); const f = freshness(await source.latest(), c.stale, now); return { status: f.stale ? 'degraded' : 'ready', dependencies: 'postgresql-ready,' + f.dependency, database: 'ready' }; }
  catch { return { status: 'degraded', dependencies: 'postgresql-unavailable,collector-snapshot-unknown', database: 'unavailable' }; }
}

/** Latest stored snapshot (or an empty one), its freshness and the stale-data banner. Throws when storage is unreadable. */
export async function current({ source, config, now }: StatusContext): Promise<{ snapshot: Snapshot; freshness: Freshness; notice: Notice | null }> {
  const stored = await source.latest();
  const f = freshness(stored, config.stale, now);
  return { snapshot: stored ?? snapshot([], [], new Date(now).toISOString()), freshness: f, notice: notice(stored, f) };
}
