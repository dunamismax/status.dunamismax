import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-node';
import tailwindcss from '@tailwindcss/vite';

// Server-rendered observer: adapter-node standalone output in dist/ (the
// collector's tsc output owns build/). Caddy compresses, so no precompression.
export default defineConfig({
  // The commit /healthz reports; deploy/build.sh sets it (see src/lib/web.ts).
  define: { __STATUS_REVISION__: JSON.stringify(process.env.STATUS_REVISION || 'unrecorded') },
  plugins: [
    tailwindcss(),
    sveltekit({
      adapter: adapter({ out: 'dist', precompress: false }),
      paths: { relative: false },
      // No forms, actions or mutating handlers exist; hooks.server.ts answers
      // every non-GET/HEAD request with 405 (CSP also sets form-action 'none').
      // '*' compiles out the form-origin check so that 405 contract holds.
      csrf: { trustedOrigins: ['*'] },
      version: { pollInterval: 0 }
    })
  ],
  server: { host: '127.0.0.1', port: 8096, strictPort: true }
});
