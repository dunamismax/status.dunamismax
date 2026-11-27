import { timestamp, type State } from '../lib/model.js';

export type Evaluation = [State, string];
export type HttpEvidence = (body: Buffer, headers: Headers, now: number) => Evaluation;

function jsonObject(body: Buffer): Record<string, unknown> | null {
  try {
    return object(JSON.parse(body.toString('utf8')));
  } catch {
    return null;
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** A health endpoint whose whole body is `ok`. */
export const plainOk = (label: string): HttpEvidence => body => body.toString('utf8').trim() === 'ok'
  ? ['operational', `${label} health response is OK`]
  : ['degraded', `expected ${label} health response was missing`];

/**
 * RiverMind Poker's `/healthz` has answered as the host's web platform contract
 * asks since its 2026-11-21 deploy: JSON with the web server's status, the
 * release revision and a database check, in place of a bare `ok`.
 */
export const rivermindHealth: HttpEvidence = body => {
  const data = jsonObject(body);
  if (data?.status !== 'ok') return ['degraded', 'expected RiverMind Poker web server health response was missing'];
  if (data.database !== 'ok') return ['degraded', 'RiverMind Poker health response reported a database problem'];
  return ['operational', 'RiverMind Poker web server and database health responses are OK'];
};

/**
 * The host web platform contract's `/healthz`: the app and its database
 * reported separately. Day by Word and Field Cadence answer this way too, so
 * their checks exercise the database, which their home pages do not.
 */
export const contractHealth: HttpEvidence = body => {
  const data = jsonObject(body);
  if (data?.status !== 'ok') return ['degraded', 'health response did not report ok'];
  if (data.database !== 'ok') return ['degraded', 'health response reported a database problem'];
  return ['operational', 'site and database health responses are OK'];
};

/** C From The Ground Up's `/healthz` is the contract's. */
export const cfromthegroundupHealth: HttpEvidence = contractHealth;

/** The Imaging Services `/healthz` answers only after loading its pages from its content store. */
export const imagingHealth: HttpEvidence = body => {
  const data = jsonObject(body);
  if (data?.status !== 'ok') return ['degraded', 'health response did not report ok'];
  if (typeof data.storage !== 'string' || !data.storage) return ['degraded', 'health response did not name its content store'];
  return ['operational', 'site and content store health response is OK'];
};

export const installerRange: HttpEvidence = (body, headers) => {
  const length = Number(headers.get('content-range')?.match(/^bytes 0-1\/(\d+)$/i)?.[1]);
  if (!Number.isSafeInteger(length) || length <= 2 || !/^attachment\s*;/i.test(headers.get('content-disposition') ?? '')) {
    return ['degraded', 'installer download headers were invalid'];
  }
  if (body.length !== 2 || body[0] !== 0x4d || body[1] !== 0x5a) {
    return ['degraded', 'installer bytes did not match a Windows executable'];
  }
  return ['operational', 'download served a Windows executable byte range'];
};
