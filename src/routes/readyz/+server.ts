import { readiness } from '#lib/web.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => Response.json(await readiness(locals.status.source, locals.status.config, locals.status.now));
