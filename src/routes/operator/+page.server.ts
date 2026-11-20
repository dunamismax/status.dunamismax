import { error } from '@sveltejs/kit';
import { current, operatorAccess, readiness } from '#lib/web.js';
import type { PageServerLoad } from './$types';

// hooks.server.ts has already rejected a wrong bearer token with 401; this
// re-check keeps the page closed even if that ordering ever changes.
export const load: PageServerLoad = async ({ locals, request }) => {
  const { config, source, now } = locals.status;
  if (operatorAccess(request.headers.get('authorization'), config.token) !== 'granted') error(404, 'Not found');
  const latest = await current(locals.status).catch(() => error(503, 'Status history is unavailable'));
  const ready = await readiness(source, config, now);
  return { title: 'Operator', notice: latest.notice, snapshot: latest.snapshot, ready, repoRoot: config.repoRoot };
};
