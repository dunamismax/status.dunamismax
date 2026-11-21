export function integer(env: NodeJS.ProcessEnv, key: string, fallback: number, min: number, max: number): number {
  const raw = env[key]?.trim(); if (!raw) return fallback;
  const n = Number(raw); if (!/^-?\d+$/.test(raw) || !Number.isSafeInteger(n) || n < min || n > max) throw new Error('Invalid '+key);
  return n;
}
function deliveryUrl(env: NodeJS.ProcessEnv, key: string): string | null {
  const raw = env[key]?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const loopback = ['127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol === 'https:' || (url.protocol === 'http:' && loopback)) && !url.username && !url.password && !url.hash) return url.href;
  } catch { /* Errors from URL parsing can expose the secret URL. */ }
  throw new Error('Invalid ' + key);
}
export type WebhookFormat = 'json' | 'discord';
/** How the alert POST is shaped: the collector's own JSON, or a Discord incoming-webhook message. */
function webhookFormat(env: NodeJS.ProcessEnv): WebhookFormat {
  const raw = env.STATUS_ALERT_WEBHOOK_FORMAT?.trim();
  if (!raw || raw === 'json') return 'json';
  if (raw === 'discord') return 'discord';
  throw new Error('Invalid STATUS_ALERT_WEBHOOK_FORMAT');
}
export function config(env: NodeJS.ProcessEnv = process.env) {
  const token = env.STATUS_OPERATOR_TOKEN?.trim() || null;
  if (token && Buffer.byteLength(token)<32) throw new Error('Operator token is too short');
  return { token, webhook: deliveryUrl(env,'STATUS_ALERT_WEBHOOK_URL'), webhookFormat: webhookFormat(env), heartbeat: deliveryUrl(env,'STATUS_HEARTBEAT_URL'), stale: integer(env,'STATUS_STALE_AFTER_MINUTES',15,1,10080), retention: integer(env,'STATUS_RETENTION_DAYS',30,1,3650), repeat: integer(env,'STATUS_ALERT_REPEAT_AFTER_MINUTES',60,0,525600), confirmations: integer(env,'STATUS_ALERT_CONFIRMATIONS',2,1,10), maxAlerts: integer(env,'STATUS_ALERT_MAX_NOTIFICATIONS_PER_RUN',5,0,1000), repoRoot: env.STATUS_REPO_ROOT || '/home/sawyer/github' };
}
export type Config = ReturnType<typeof config>;
