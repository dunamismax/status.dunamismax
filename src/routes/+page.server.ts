import { error } from '@sveltejs/kit';
import { estDay } from '#lib/model.js';
import { current, history } from '#lib/web.js';
import { indexHistory, overview } from '#lib/view.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const latest = await current(locals.status).catch(() => error(503, 'Status history is unavailable'));
  const h = indexHistory(await history(locals.status), estDay(locals.status.now));
  return { title: 'Dunamis Status', refresh: true, notice: latest.notice, overview: overview(latest.snapshot, latest.freshness, h) };
};
