import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
export default defineConfig({ output: 'server', adapter: node({ mode: 'standalone' }), trailingSlash: 'ignore', security: { checkOrigin: false }, server: { host: '127.0.0.1', port: 4313 } });
