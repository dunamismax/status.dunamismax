export const states = ['operational', 'degraded', 'down', 'maintenance', 'unknown'] as const;
export type State = typeof states[number];
const rank: Record<State, number> = { operational: 0, maintenance: 1, unknown: 2, degraded: 3, down: 4 };
export const worst = (s: State[]): State => s.reduce<State>((a,b) => rank[b] > rank[a] ? b : a, s[0] ?? 'unknown');
export interface Service { target: { id: string; name: string; group: string; public_url: string; probe_url: string; expected_status: number }; check: { target_id: string; check_kind: string; state: State; checked_at: string; latency_ms: number | null; reason: string; probe_version: string } }
export interface GitStatus { branch: string | null; upstream: string | null; ahead: number | null; behind: number | null; dirty: boolean | null; latest_commit_age_days: number | null; remote_reachable: boolean | null }
export interface BuildProgress { checked: number; total: number; next_phase: string | null }
export interface Project { target: { id: string; name: string; repo_name: string; public_url: string | null }; state: State; checked_at: string; reason: string; git: GitStatus; build: BuildProgress | null; probe_version: string }
export interface Snapshot { overall_state: State; checked_at: string; summary: Record<State, number>; services: Service[]; projects: Project[] }
export interface Incident { title: string; affected_targets: string[]; state: string; started_at: string; resolved_at: string | null; public_notes: string }
export interface Maintenance { title: string; affected_targets: string[]; state: string; starts_at: string; ends_at: string; public_notes: string }
export interface Deployment { service_id: string | null; repo_name: string | null; commit_sha: string | null; environment: string; deployed_at: string; public_summary: string }
export function snapshot(services: Service[] = [], projects: Project[] = [], at = new Date().toISOString()): Snapshot {
  services = services.map(s=>({...s,check:{...s.check,checked_at:timestamp(s.check.checked_at)}})).sort((a,b) => a.target.name < b.target.name ? -1 : a.target.name > b.target.name ? 1 : 0);
  projects = projects.map(p=>({...p,checked_at:timestamp(p.checked_at)})).sort((a,b) => a.target.name < b.target.name ? -1 : a.target.name > b.target.name ? 1 : 0);
  const times = [...services.map(s=>s.check.checked_at), ...projects.map(p=>p.checked_at)];
  const summary: Record<State,number> = { operational:0, degraded:0, down:0, maintenance:0, unknown:0 };
  for (const s of services) summary[s.check.state]++;
  return { overall_state: worst([...services.map(s=>s.check.state), ...projects.map(p=>p.state)]), checked_at: times.sort((a,b)=>Date.parse(b)-Date.parse(a))[0] ?? at, summary, services, projects };
}
export function freshness(s: Snapshot | null, minutes: number, now = Date.now()) {
  const age = s ? Math.floor(Math.max(0, now - Date.parse(s.checked_at)) / 60000) : 0;
  const stale = s === null || age >= minutes;
  return { age, stale, missing: s === null, dependency: s === null ? 'collector-snapshot-missing' : stale ? 'collector-snapshot-stale' : 'collector-snapshot-fresh' };
}
export function timestamp(raw: string): string {
  if (!/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:\.\d{1,9})?(?:Z|[+-]\d\d(?::?\d\d)?)$/i.test(raw) || !Number.isFinite(Date.parse(raw))) throw new Error('Timestamp must be RFC 3339 with an explicit offset.');
  const calendar=raw.slice(0,10).split('-').map(Number);const check=new Date(Date.UTC(calendar[0]!,calendar[1]!-1,calendar[2]!));
  if(check.toISOString().slice(0,10)!==raw.slice(0,10))throw new Error('Invalid calendar date');
  const iso=new Date(raw).toISOString().slice(0,19);
  const micro=(raw.match(/\.(\d+)/)?.[1]??'').slice(0,6).padEnd(6,'0');
  const fraction=Number(micro)===0?'':Number(micro)%1000===0?'.'+micro.slice(0,3):'.'+micro;
  return iso+fraction+'Z';
}
export const displayTime = (s: string) => new Date(Date.parse(s)-5*3600000).toISOString().slice(0,19).replace('T',' ')+' EST';
