// Server-side request policy for the SvelteKit app: the public route allowlist,
// response headers, operator bearer check and snapshot loading. Imported only
// by hooks.server.ts and server route modules, never by components.
import { timingSafeEqual } from 'node:crypto';
import { freshness, snapshot, type DailyCount, type Freshness, type Snapshot } from './model.js';
import { historyDays, notice, type Notice } from './view.js';
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

/** The release's commit, fixed at build time: deploy/build.sh builds with
 * STATUS_REVISION set to the commit it also writes to the release's REVISION file.
 * Web code has no filesystem access, so it is not read at runtime. */
declare const __STATUS_REVISION__: string | undefined;
// Vite replaces the name in the server build; tsc output (the collector's build/) has none.
export const revision: string = typeof __STATUS_REVISION__ === 'string' ? __STATUS_REVISION__ : 'unrecorded';

/** Deploy and monitoring health: one real query through the web pool; 503 when PostgreSQL cannot answer. */
export async function health(source: Source): Promise<{ status: 200 | 503; body: { status: string; revision: string; database: string } }> {
  try { await source.ping(); return { status: 200, body: { status: 'ok', revision, database: 'ok' } }; }
  catch { return { status: 503, body: { status: 'unavailable', revision, database: 'unavailable' } }; }
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

/** Daily state counts for the history bars, or null when they cannot be read: history is supplementary, so its failure never fails a page. */
export async function history({ source, now }: StatusContext): Promise<DailyCount[] | null> {
  try { return await source.history(historyDays, now); } catch { return null; }
}
