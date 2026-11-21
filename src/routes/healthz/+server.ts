import { health } from '#lib/web.js';
import type { RequestHandler } from './$types';

// Readiness for the deploy's candidate check: the release's revision and a real database query.
export const GET: RequestHandler = async ({ locals }) => {
  const { status, body } = await health(locals.status.source);
  return Response.json(body, { status });
};
