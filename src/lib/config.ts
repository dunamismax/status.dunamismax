export function integer(env: NodeJS.ProcessEnv, key: string, fallback: number, min: number, max: number): number {
  const raw = env[key]?.trim(); if (!raw) return fallback;
  const n = Number(raw); if (!/^-?\d+$/.test(raw) || !Number.isSafeInteger(n) || n < min || n > max) throw new Error('Invalid '+key);
  return n;
}
export function config(env: NodeJS.ProcessEnv = process.env) {
  const token = env.STATUS_OPERATOR_TOKEN?.trim() || null;
  if (token && Buffer.byteLength(token)<32) throw new Error('Operator token is too short');
  const webhook = env.STATUS_ALERT_WEBHOOK_URL?.trim() || null;
  if (webhook && !['http:','https:'].includes(new URL(webhook).protocol)) throw new Error('Invalid webhook protocol');
  return { token, webhook, stale: integer(env,'STATUS_STALE_AFTER_MINUTES',15,1,10080), retention: integer(env,'STATUS_RETENTION_DAYS',30,1,3650), repeat: integer(env,'STATUS_ALERT_REPEAT_AFTER_MINUTES',60,0,525600), maxAlerts: integer(env,'STATUS_ALERT_MAX_NOTIFICATIONS_PER_RUN',5,0,1000), repoRoot: env.STATUS_REPO_ROOT || '/home/sawyer/github' };
}
export type Config = ReturnType<typeof config>;
