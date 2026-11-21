import { error } from '@sveltejs/kit';
import { estDay } from '#lib/model.js';
import { current, history } from '#lib/web.js';
import { categories, indexHistory, track } from '#lib/view.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const latest = await current(locals.status).catch(() => error(503, 'Status history is unavailable'));
  const h = indexHistory(await history(locals.status), estDay(locals.status.now));
  return { title: 'Services', refresh: true, notice: latest.notice, services: latest.snapshot.services, summary: latest.snapshot.summary, groups: categories(latest.snapshot, h),
    uptime: Object.fromEntries(latest.snapshot.services.map(v => [v.target.id, h ? track(h, [v.target.id]).uptime : 'unavailable'])) };
};
