// The sites and apps the overview presents, each tied to the collector target
// IDs that provide its evidence. Pure data: components and view helpers may
// import it. tests/core.test.ts checks every ID against the collector inventory,
// so a renamed or removed target cannot silently drop out of this view.

export interface Property {
  /** Stable slug, used for page anchors. */
  id: string;
  name: string;
  url: string | null;
  summary: string;
  /** The check whose history and state headline the property. */
  primary: string;
  /** Other service checks that belong to it: endpoints, units, certificates, jobs. */
  checks: string[];
  /** Project (repository) IDs from the snapshot's projects list. */
  projects: string[];
}

const cert = (host: string) => 'certificate-' + host;
const job = (id: string) => [id, id + '-timer'];

export const properties: Property[] = [
  { id: 'dunamismax-com', name: 'dunamismax.com', url: 'https://dunamismax.com', summary: 'Personal site, portfolio and writing',
    primary: 'dunamismax-com', checks: [cert('dunamismax.com'), 'dunamismax', ...job('dunamismax-backup')], projects: ['dunamismax-com'] },
  { id: 'azerothtrail', name: 'Azeroth Trail', url: 'https://azerothtrail.com', summary: 'WoW Classic leveling guides and realm tracker',
    primary: 'azerothtrail-com', checks: ['azerothtrail-status-api', cert('azerothtrail.com'), 'azerothtrail'], projects: ['azerothtrail'] },
  { id: 'lorehallow', name: 'Lorehallow', url: 'https://lorehallow.com', summary: 'Pixel-art MMO website and Go game server',
    primary: 'lorehallow-com', checks: ['lorehallow-game', cert('lorehallow.com'), cert('play.lorehallow.com'), 'lorehallow-web', 'lorehallow-server'], projects: ['lorehallow'] },
  { id: 'rivermind-poker', name: 'RiverMind Poker', url: 'https://rivermindpoker.com', summary: 'No-limit poker tables in the browser',
    primary: 'rivermindpoker-com', checks: ['rivermindpoker-api', cert('rivermindpoker.com'), 'rivermind-poker-web', 'rivermind-poker'], projects: ['rivermind-poker'] },
  { id: 'cfromthegroundup', name: 'C From The Ground Up', url: 'https://cfromthegroundup.com', summary: 'Free 38-lesson C course, with analytics',
    primary: 'cfromthegroundup-com', checks: ['cfromthegroundup-analytics', cert('cfromthegroundup.com'), 'cfromthegroundup', 'umami', ...job('cfromthegroundup-backup')], projects: ['c-from-the-ground-up'] },
  { id: 'daybyword', name: 'Day by Word', url: 'https://daybyword.com', summary: 'Bible reading plans and progress',
    primary: 'daybyword-com', checks: [cert('daybyword.com'), ...job('daybyword-backup'), ...job('daybyword-restore-check')], projects: ['daybyword'] },
  { id: 'vincentsawyer-org', name: 'vincentsawyer.org', url: 'https://vincentsawyer.org', summary: 'Sermons and Bible teaching',
    primary: 'vincentsawyer-org', checks: [cert('vincentsawyer.org'), 'vincentsawyer-web', ...job('vincentsawyer-backup')], projects: ['vincentsawyer-org'] },
  { id: 'graceandfootnotes', name: 'Grace and Footnotes', url: 'https://graceandfootnotes.com', summary: 'Christian faith and honest questions',
    primary: 'graceandfootnotes-com', checks: [cert('graceandfootnotes.com'), 'graceandfootnotes', ...job('graceandfootnotes-backup')], projects: ['graceandfootnotes-com'] },
  { id: 'xrayservice', name: 'XrayService', url: 'https://xrayservice.net', summary: 'Remote support portal, installer and email assets',
    primary: 'xrayservice-net', checks: ['xrayservice-installer', 'xrayservice-data', cert('xrayservice.net'), cert('data.xrayservice.net'), 'xrayservice-web'], projects: ['xrayservice'] },
  { id: 'imagingservices', name: 'Imaging Services', url: 'https://demo.xrayservice.net', summary: 'Digital x-ray sales and service site (demo)',
    primary: 'imagingservices-demo', checks: [cert('demo.xrayservice.net'), 'imagingservices'], projects: ['imagingservices'] },
  { id: 'status', name: 'Dunamis Status', url: 'https://status.dunamismax.com', summary: 'This status page',
    primary: 'status-dunamismax-com', checks: [cert('status.dunamismax.com'), 'status-dunamismax-web', 'status-dunamismax-collector', 'collector-run', ...job('status-dunamismax-backup')], projects: ['status-dunamismax'] },
  { id: 'mtg-card-bot', name: 'MTG card bot', url: null, summary: 'Discord bot for Magic: The Gathering card lookups',
    primary: 'mtg-card-bot', checks: [], projects: ['mtg-card-bot'] },
  { id: 'rustdesk', name: 'RustDesk', url: null, summary: 'Remote desktop rendezvous and relay',
    primary: 'rustdesk-tcp-21116', checks: ['rustdesk-tcp-21115', 'rustdesk-tcp-21117', ...job('rustdesk-backup'), ...job('rustdesk-preconfig-build')], projects: [] }
];
