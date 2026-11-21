// Presentation helpers shared by the Svelte pages. Pure functions only: no
// database, configuration, collector or Node APIs, so components may import it.
import { addDays, displayTime, states, worst, type BuildProgress, type DailyCount, type Freshness, type Project, type Service, type Snapshot, type State } from './model.js';
import { properties } from './catalog.js';

export const siteTitle = 'Dunamis Status';
export const pageTitle = (title: string): string => title === siteTitle ? title : `${title} · ${siteTitle}`;
export const nav = [['/', 'Overview'], ['/services', 'Services'], ['/projects', 'Projects'], ['/incidents', 'Incidents'], ['/deployments', 'Deployments']] as const;

/** Only absolute http(s) links are rendered; anything else becomes an inert '#'. */
export const safeUrl = (url: string): string => /^https?:\/\//i.test(url) ? url : '#';
export const latency = (v: number | null): string => v === null ? 'n/a' : `${v} ms`;
export const worktree = (v: boolean | null): string => v === null ? 'unknown' : v ? 'dirty' : 'clean';

export const headline: Record<State, string> = {
  operational: 'All monitored public endpoints are operational',
  degraded: 'Some public endpoints are degraded',
  down: 'One or more public endpoints are down',
  maintenance: 'Public endpoints are undergoing maintenance',
  unknown: 'Public availability is unknown'
};

/** Stale-data banner content for pages backed by the latest snapshot. */
export interface Notice { missing: boolean; checked_at: string | null; age: number }
export const notice = (s: Snapshot | null, f: Freshness): Notice | null =>
  f.stale ? { missing: f.missing, checked_at: s ? s.checked_at : null, age: f.age } : null;

const groupsOrder = ['Public websites', 'Public certificates', 'Maintenance', 'Backups & maintenance', 'Application services', 'Remote access', 'Container services', 'Databases', 'Deployment automation', 'Host capacity', 'Network & access', 'Host infrastructure', 'Host services'];
const attentionOrder: State[] = ['down', 'degraded', 'unknown', 'maintenance'];
/** The overview lists this many checks needing attention and counts the rest, so none is hidden. */
export const attentionLimit = 6;
const maintenanceCheck = (s: Service) => ['Maintenance', 'Backups & maintenance'].includes(s.target.group) || s.target.id === 'backup-repository-growth';
const order = (group: string) => groupsOrder.indexOf(group) < 0 ? 99 : groupsOrder.indexOf(group);

export interface Group { name: string; state: State; services: Service[]; track: Track | null }
export interface Overview {
  publicState: State; headline: string; lastChecked: string; publicChecks: string;
  maintenanceState: State; infrastructureState: State;
  attentionTitle: string; attention: Service[]; attentionMore: number; attentionNote: string;
  groupsTitle: string; categories: Group[];
  tally: [State, number][]; checks: number; projects: number; sites: PropertyView[];
}

export function overview(s: Snapshot, f: Freshness, h: History | null = null): Overview {
  const publicChecks = s.services.filter(v => v.target.group === 'Public websites');
  const maintenance = s.services.filter(maintenanceCheck);
  const infrastructure = s.services.filter(v => v.target.group !== 'Public websites' && !maintenanceCheck(v));
  const current = (checks: Service[]): State => f.stale ? 'unknown' : worst(checks.map(v => v.check.state));
  const publicState = current(publicChecks);
  const attention = s.services.filter(v => v.check.state !== 'operational').sort((a, b) => attentionOrder.indexOf(a.check.state) - attentionOrder.indexOf(b.check.state));
  const groups = categories(s, h);
  const previously = f.stale && !f.missing;
  return {
    publicState, headline: headline[publicState],
    lastChecked: f.missing ? 'never' : displayTime(s.checked_at),
    publicChecks: f.stale ? 'unknown' : String(publicChecks.length),
    maintenanceState: current(maintenance), infrastructureState: current(infrastructure),
    attentionTitle: previously ? 'Previously needing attention' : 'Attention',
    attention: attention.slice(0, attentionLimit), attentionMore: Math.max(0, attention.length - attentionLimit),
    attentionNote: f.missing ? 'No checks have been recorded yet.' : f.stale ? 'No checks needed attention in the last snapshot.' : 'No monitored checks currently need attention.',
    groupsTitle: previously ? 'Last observed systems' : 'Systems',
    categories: groups,
    tally: states.filter(v => s.summary[v] > 0 || v === 'operational').map(v => [v, s.summary[v]]),
    checks: s.services.length, projects: s.projects.length,
    sites: sites(s, h)
  };
}

/** Service checks grouped by category, in the established category order. */
export function categories(s: Snapshot, h: History | null = null): Group[] {
  const grouped = new Map<string, Service[]>();
  for (const v of s.services) grouped.set(v.target.group, [...(grouped.get(v.target.group) ?? []), v]);
  return [...grouped].map(([name, services]) => ({ name, services, state: worst(services.map(v => v.check.state)), track: h && track(h, services.map(v => v.target.id)) }))
    .sort((a, b) => order(a.name) - order(b.name) || a.name.localeCompare(b.name));
}

/** A URL fragment for a group name, e.g. "Network & access" → "network-access". */
export const anchor = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---- Daily history bars ---------------------------------------------------

export const historyDays = 90;
export type DayState = State | 'none';
export interface Day { state: DayState; label: string }
/** A run of daily cells, oldest first, with the share of recorded checks that were operational. */
export interface Track { days: Day[]; uptime: string; summary: string }
type Counts = Record<State, number>;
/** Daily counts indexed by target and then day, plus the current EST day. */
export interface History { today: string; days: number; byTarget: Map<string, Map<string, Counts>> }

export function indexHistory(rows: DailyCount[] | null, today: string, days = historyDays): History | null {
  if (!rows) return null;
  const byTarget = new Map<string, Map<string, Counts>>();
  for (const r of rows) {
    const target = byTarget.get(r.target_id) ?? new Map<string, Counts>();
    const counts = target.get(r.day) ?? { operational: 0, degraded: 0, down: 0, maintenance: 0, unknown: 0 };
    counts[r.state] += r.samples;
    target.set(r.day, counts);
    byTarget.set(r.target_id, target);
  }
  return { today, days, byTarget };
}

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dayLabel = (day: string): string => `${months[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}, ${day.slice(0, 4)}`;
/** Rounded down, so a single failed check never reads as 100%. */
export const percent = (ratio: number): string => ratio >= 1 ? '100%' : `${(Math.floor(ratio * 10000) / 100).toFixed(2)}%`;

/** Combined daily history of one or more targets. A day takes the worst state recorded on it; days without checks stay empty. */
export function track(h: History, ids: string[]): Track {
  const days: Day[] = [];
  let total = 0, operational = 0, recorded = 0;
  for (let i = h.days - 1; i >= 0; i--) {
    const day = addDays(h.today, -i);
    const c: Counts = { operational: 0, degraded: 0, down: 0, maintenance: 0, unknown: 0 };
    for (const id of ids) { const d = h.byTarget.get(id)?.get(day); if (d) for (const v of states) c[v] += d[v]; }
    const n = states.reduce((sum, v) => sum + c[v], 0);
    total += n; operational += c.operational; if (n) recorded++;
    const state: DayState = n === 0 ? 'none' : c.down ? 'down' : c.degraded ? 'degraded' : c.unknown ? 'unknown' : c.maintenance ? 'maintenance' : 'operational';
    const other = states.filter(v => v !== 'operational' && c[v]).map(v => `${c[v]} ${v}`);
    days.push({ state, label: n === 0 ? `${dayLabel(day)}: no checks recorded` : `${dayLabel(day)}: ${c.operational} of ${n} checks operational${other.length ? ' (' + other.join(', ') + ')' : ''}` });
  }
  const uptime = total ? percent(operational / total) : 'No data';
  const span = recorded === h.days ? `the last ${h.days} days` : `${recorded} recorded ${recorded === 1 ? 'day' : 'days'}`;
  return { days, uptime, summary: total ? `${uptime} of checks operational over ${span}` : `No checks recorded in the last ${h.days} days` };
}

// ---- Sites and apps ------------------------------------------------------------

export interface Chip { name: string; state: State; reason: string }
export interface PropertyView {
  id: string; name: string; url: string | null; summary: string; state: State;
  primary: Service | null; checks: Chip[]; projects: Project[]; track: Track | null;
}

/** Each catalogued site or app with its current checks. Its state is the worst of its checks, which are all listed so the cause is visible. */
export function sites(s: Snapshot, h: History | null = null): PropertyView[] {
  const byId = new Map(s.services.map(v => [v.target.id, v]));
  return properties.map(p => {
    const primary = byId.get(p.primary) ?? null;
    const related = p.checks.map(id => byId.get(id)).filter((v): v is Service => v !== undefined);
    const present = primary ? [primary, ...related] : related;
    return {
      id: p.id, name: p.name, url: p.url, summary: p.summary,
      state: worst(present.map(v => v.check.state)),
      primary,
      checks: related.map(v => ({ name: v.target.name, state: v.check.state, reason: v.check.reason })),
      projects: s.projects.filter(v => p.projects.includes(v.target.id)),
      track: h && track(h, [p.primary])
    };
  });
}

/** Filled segments of a ten-part progress bar. */
export const segments = (checked: number, total: number): boolean[] =>
  Array.from({ length: 10 }, (_, i) => total > 0 && i < Math.round(checked / total * 10));

export const projectFacts = (p: Project): [string, string][] => [
  ['Branch', p.git.branch ?? 'unknown'],
  ['Upstream', p.git.upstream ?? 'none'],
  ['Ahead / behind', `${p.git.ahead ?? 0} / ${p.git.behind ?? 0}`],
  ['Worktree', worktree(p.git.dirty)],
  ['Latest commit', p.git.latest_commit_age_days === null ? 'unknown' : `${p.git.latest_commit_age_days} days`],
  ['Origin', p.git.remote_reachable === null ? 'unknown' : p.git.remote_reachable ? 'reachable' : 'unreachable'],
  // The projects page draws BUILD progress as its own block when it is available.
  ...(p.build ? [] : [['BUILD progress', 'BUILD progress unavailable'] as [string, string]])
];

export const buildNext = (b: BuildProgress): string =>
  b.next_phase ? `Next: ${b.next_phase}` : b.checked < b.total ? 'Open steps outside a numbered phase' : 'Every step is checked';
