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

function observationTime(value: unknown, now: number): number | null {
  if (typeof value !== 'string') return null;
  try {
    const measured = Date.parse(timestamp(value));
    return measured <= now + 60_000 ? measured : null;
  } catch {
    return null;
  }
}

export const azerothStatus: HttpEvidence = (body, _headers, now) => {
  const data = jsonObject(body);
  if (data?.version !== 1 || !Array.isArray(data.regions)) {
    return ['degraded', 'tracker response did not match the status API'];
  }

  const generated = observationTime(data.generatedAt, now);
  if (generated === null) return ['degraded', 'tracker snapshot time is unavailable or invalid'];
  const maxAge = 5 * 60_000;
  if (now - generated > maxAge) return ['degraded', 'tracker snapshot is more than five minutes old'];

  const regions = data.regions.map(object);
  const readings = ['us', 'eu', 'kr', 'tw'].map(key => regions.find(region => region?.key === key));
  const times = readings.map(region => observationTime(region?.checkedAt, now));
  if (times.some(time => time === null) || readings.some(region => !Array.isArray(region?.rulesets) || !region.rulesets.length)) {
    return ['degraded', 'tracker is missing usable readings for one or more regions'];
  }
  if (times.some(time => time !== null && now - time > maxAge)) {
    return ['degraded', 'one or more tracker region readings are more than five minutes old'];
  }
  return ['operational', 'tracker returned fresh data for all four regions'];
};

/** A health endpoint whose whole body is `ok`, as Lorehallow's game server answers. */
export const plainOk = (label: string): HttpEvidence => body => body.toString('utf8').trim() === 'ok'
  ? ['operational', `${label} health response is OK`]
  : ['degraded', `expected ${label} health response was missing`];

export const lorehallowHealth: HttpEvidence = plainOk('game server');

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
