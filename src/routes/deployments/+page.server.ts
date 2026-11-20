import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const deployments = await locals.status.source.deployments().catch(() => error(503, 'Status history is unavailable'));
  return { title: 'Deployments', deployments };
};
