import type { StatusContext } from '#lib/web.js';
import type { Notice } from '#lib/view.js';

declare global {
  namespace App {
    interface Locals { status: StatusContext }
    // adapter-node supplies `req`; tests inject `status` through Server.respond.
    interface Platform { req?: unknown; status?: StatusContext }
    interface PageData { title?: string; notice?: Notice | null }
  }
}

export {};
