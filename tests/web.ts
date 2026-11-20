// Drives the built SvelteKit server (dist/server, from `vite build`) in-process.
// Each request injects its storage, configuration and clock through
// `platform.status`, which adapter-node never sets in production.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Config } from '../src/lib/config.js';
import type { Source } from '../src/lib/source.js';

interface Instance {
  init(options: { env: Record<string, string>; read: (file: string) => ReadableStream }): Promise<void>;
  respond(request: Request, options: { platform: unknown; getClientAddress: () => string }): Promise<Response>;
}
let instance: Promise<Instance> | undefined;
async function start(): Promise<Instance> {
  const { server } = await import(pathToFileURL(resolve('dist/server/server.js')).href) as { server: Instance };
  await server.init({ env: {}, read: () => { throw new Error('static assets are served by adapter-node, not the app'); } });
  return server;
}
export async function handle(request: Request, source: Source, config: Config, now = Date.now()): Promise<Response> {
  const server = await (instance ??= start());
  return server.respond(request, { platform: { status: { source, config, now } }, getClientAddress: () => '127.0.0.1' });
}
