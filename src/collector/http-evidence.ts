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

export const lorehallowHealth: HttpEvidence = body => body.toString('utf8').trim() === 'ok'
  ? ['operational', 'game server health response is OK']
  : ['degraded', 'expected game server health response was missing'];

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
