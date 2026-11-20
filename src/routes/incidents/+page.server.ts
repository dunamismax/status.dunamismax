import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const { source } = locals.status;
  const [incidents, maintenance] = await Promise.all([source.incidents(), source.maintenance()]).catch(() => error(503, 'Status history is unavailable'));
  return { title: 'Incidents', incidents, maintenance };
};
