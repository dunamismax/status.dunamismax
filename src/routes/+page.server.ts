import { error } from '@sveltejs/kit';
import { current } from '#lib/web.js';
import { overview } from '#lib/view.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const latest = await current(locals.status).catch(() => error(503, 'Status history is unavailable'));
  return { title: 'Dunamis Status', notice: latest.notice, overview: overview(latest.snapshot, latest.freshness) };
};
