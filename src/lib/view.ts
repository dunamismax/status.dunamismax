// Presentation helpers shared by the Svelte pages. Pure functions only: no
// database, configuration, collector or Node APIs, so components may import it.
import { displayTime, worst, type Freshness, type Project, type Service, type Snapshot, type State } from './model.js';

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

const groupsOrder = ['Public websites', 'Maintenance', 'Backups & maintenance', 'Application services', 'Remote access', 'Container services', 'Databases', 'Deployment automation', 'Host capacity', 'Network & access', 'Host infrastructure', 'Host services'];
const attentionOrder: State[] = ['down', 'degraded', 'unknown', 'maintenance'];
const maintenanceCheck = (s: Service) => ['Maintenance', 'Backups & maintenance'].includes(s.target.group) || s.target.id === 'backup-repository-growth';
const order = (group: string) => groupsOrder.indexOf(group) < 0 ? 99 : groupsOrder.indexOf(group);
// Code-unit comparison of "name," keeps the long-standing alphabetical group list order.
const byName = (a: string, b: string) => a + ',' < b + ',' ? -1 : a + ',' > b + ',' ? 1 : 0;

export interface Group { name: string; state: State; services: Service[] }
export interface Overview {
  publicState: State; headline: string; lastChecked: string; publicChecks: string;
  maintenanceState: State; infrastructureState: State;
  attentionTitle: string; attention: Service[]; attentionNote: string;
  groupsTitle: string; groups: Group[]; categories: Group[];
}

export function overview(s: Snapshot, f: Freshness): Overview {
  const publicChecks = s.services.filter(v => v.target.group === 'Public websites');
  const maintenance = s.services.filter(maintenanceCheck);
  const infrastructure = s.services.filter(v => v.target.group !== 'Public websites' && !maintenanceCheck(v));
  const current = (checks: Service[]): State => f.stale ? 'unknown' : worst(checks.map(v => v.check.state));
  const publicState = current(publicChecks);
  const attention = s.services.filter(v => v.check.state !== 'operational').sort((a, b) => attentionOrder.indexOf(a.check.state) - attentionOrder.indexOf(b.check.state));
  const grouped = new Map<string, Service[]>();
  for (const v of s.services) grouped.set(v.target.group, [...(grouped.get(v.target.group) ?? []), v]);
  const groups = [...grouped].map(([name, services]) => ({ name, services, state: worst(services.map(v => v.check.state)) }));
  const previously = f.stale && !f.missing;
  return {
    publicState, headline: headline[publicState],
    lastChecked: f.missing ? 'never' : displayTime(s.checked_at),
    publicChecks: f.stale ? 'unknown' : String(publicChecks.length),
    maintenanceState: current(maintenance), infrastructureState: current(infrastructure),
    attentionTitle: previously ? 'Previously needing attention' : 'Attention',
    attention: attention.slice(0, 6),
    attentionNote: f.missing ? 'No checks have been recorded yet.' : f.stale ? 'No checks needed attention in the last snapshot.' : 'No monitored checks currently need attention.',
    groupsTitle: previously ? 'Last observed groups' : 'Groups',
    groups: [...groups].sort((a, b) => byName(a.name, b.name)),
    categories: [...groups].sort((a, b) => order(a.name) - order(b.name) || a.name.localeCompare(b.name))
  };
}

export const projectFacts = (p: Project): [string, string][] => [
  ['Branch', p.git.branch ?? 'unknown'],
  ['Upstream', p.git.upstream ?? 'none'],
  ['Ahead / behind', `${p.git.ahead ?? 0} / ${p.git.behind ?? 0}`],
  ['Worktree', worktree(p.git.dirty)],
  ['Latest commit', p.git.latest_commit_age_days === null ? 'unknown' : `${p.git.latest_commit_age_days} days`],
  ['Origin', p.git.remote_reachable === null ? 'unknown' : p.git.remote_reachable ? 'reachable' : 'unreachable'],
  ['BUILD progress', p.build ? `${p.build.checked}/${p.build.total} checked · ${p.build.next_phase ?? 'No open phase found'}` : 'BUILD progress unavailable']
];
