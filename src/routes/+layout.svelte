<script lang="ts">
  import '../app.css';
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import { displayTime } from '#lib/model.js';
  import { nav, pageTitle, siteTitle } from '#lib/view.js';
  let { children }: { children: Snippet } = $props();
  // Pages ship no JavaScript, so live pages reload themselves once per collector interval.
  const notice = $derived(page.data.notice ?? null);
  const title = $derived(page.error ? (page.status === 404 ? 'Not found' : 'Unavailable') : (page.data.title ?? siteTitle));
</script>

<svelte:head>
  <title>{pageTitle(title)}</title>
  {#if page.data.refresh && !page.error}<meta http-equiv="refresh" content="300">{/if}
</svelte:head>

<a class="skip" href="#main">Skip to status</a>
<header class="site-header">
  <div class="site-header-inner">
    <a class="brand" href="/" aria-label="Dunamis Status home"><span class="brand-mark" aria-hidden="true">DS</span><span>Dunamis Status</span></a>
    <div class="header-tools">
      <nav aria-label="Primary">
        {#each nav as [href, label]}
          <a class={['nav-link', page.url.pathname === href && 'active']} {href} aria-current={page.url.pathname === href ? 'page' : undefined}>{label}</a>
        {/each}
      </nav>
    </div>
  </div>
</header>
<main id="main">
  {#if notice}
    <p class="stale-notice" role="status">
      {#if notice.missing}
        <strong>No status data yet.</strong> The collector has not recorded a snapshot, so every state is unknown.
      {:else}
        <strong>Stale data.</strong> The latest collector snapshot is from {notice.checked_at ? displayTime(notice.checked_at) : 'unknown'} ({notice.age} minutes ago). These results may no longer be current.
      {/if}
    </p>
  {/if}
  {@render children()}
</main>
<footer class="site-footer">
  <div class="site-footer-inner">
    <p>Checked every five minutes by a read-only collector. Times are EST (UTC&minus;05:00). Unknown means no current evidence, never assumed healthy.</p>
    <p class="footer-links"><a href="/api/status.json">Status JSON</a><a href="/api/incidents.json">Incidents JSON</a><a href="/readyz">Readiness</a></p>
  </div>
</footer>
