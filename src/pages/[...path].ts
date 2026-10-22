import type { APIRoute } from 'astro';
import { database } from '../lib/db.js';
import { config } from '../lib/config.js';
import { PostgresSource } from '../lib/source.js';
import { handle } from '../lib/web.js';
const source = new PostgresSource(database());
export const ALL: APIRoute = ({request}) => handle(request, source, config());
