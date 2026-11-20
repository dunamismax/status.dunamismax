import type { RequestHandler } from './$types';

// Liveness only: never touches storage.
export const GET: RequestHandler = () => new Response('ok\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
