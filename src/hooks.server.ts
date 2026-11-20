import type { Handle } from '@sveltejs/kit/hooks';
import { config } from '#lib/config.js';
import { database } from '#lib/db.js';
import { PostgresSource } from '#lib/source.js';
import { headers, operatorAccess, routes, type StatusContext } from '#lib/web.js';

let source: PostgresSource | undefined;
const production = (): StatusContext => ({ source: source ??= new PostgresSource(database()), config: config(), now: Date.now() });

const plain = (body: string, status: number, extra: Record<string, string>) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...extra } });

export const handle: Handle = async ({ event, resolve }) => {
  const status = event.platform?.status ?? production();
  event.locals.status = status;
  const path = event.url.pathname, method = event.request.method;
  let response: Response;
  if (routes.includes(path) && method !== 'GET' && method !== 'HEAD') response = plain('', 405, { 'Allow': 'GET, HEAD' });
  // The bearer check runs before any route load touches storage.
  else if (path === '/operator' && operatorAccess(event.request.headers.get('authorization'), status.config.token) === 'denied')
    response = plain('operator authorization required\n', 401, { 'WWW-Authenticate': 'Bearer realm="status-operator"' });
  // Pages ship no browser JavaScript, so Svelte's hydration markers are dead weight.
  else response = await resolve(event, { transformPageChunk: ({ html }) => html.replace(/<!--[^\s>]*-->/g, '') });
  const out = new Headers(response.headers);
  out.delete('x-sveltekit-page');
  if (out.get('content-type') === 'text/html') out.set('content-type', 'text/html; charset=utf-8');
  for (const [k, v] of Object.entries(headers)) out.set(k, v);
  if (response.status === 503) out.set('Retry-After', '60');
  if (path === '/operator' && response.status !== 404) out.set('X-Robots-Tag', 'noindex');
  return new Response(method === 'HEAD' ? null : response.body, { status: response.status, statusText: response.statusText, headers: out });
};
