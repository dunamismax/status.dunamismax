import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  const { source } = locals.status;
  try { return Response.json({ incidents: await source.incidents(), maintenance: await source.maintenance() }); }
  catch { return Response.json({ error: 'status data unavailable' }, { status: 503 }); }
};
