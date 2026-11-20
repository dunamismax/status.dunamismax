import { current } from '#lib/web.js';
import type { RequestHandler } from './$types';

const unavailable = () => Response.json({ error: 'status data unavailable' }, { status: 503 });

export const GET: RequestHandler = async ({ locals }) => {
  try { return Response.json((await current(locals.status)).snapshot); } catch { return unavailable(); }
};
