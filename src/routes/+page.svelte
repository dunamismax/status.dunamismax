<script lang="ts">
  import { anchor } from '#lib/view.js';
  import HistoryBar from '#lib/components/HistoryBar.svelte';
  import SiteCard from '#lib/components/SiteCard.svelte';
  import StateBadge from '#lib/components/StateBadge.svelte';
  import type { PageProps } from './$types';
  let { data }: PageProps = $props();
  const o = $derived(data.overview);
</script>

<section class="status-band is-{o.publicState}">
  <div>
    <p class="eyebrow">Public availability</p>
    <h1>{o.headline}</h1>
    <p class="status-scope">Watching {o.sites.length} sites and apps through {o.checks} checks and {o.projects} repositories, every five minutes.</p>
    <dl class="status-meta">
      <div><dt>Last checked</dt><dd>{o.lastChecked}</dd></div>
      <div><dt>Public HTTP checks</dt><dd>{o.publicChecks}</dd></div>
    </dl>
    <ul class="tally" aria-label="Current check states">
      {#each o.tally as [state, count]}<li class="tally-{state}"><strong>{count}</strong> {state}</li>{/each}
    </ul>
  </div>
  <dl class="health-summary">
    <div><dt>Backups and maintenance</dt><dd><StateBadge state={o.maintenanceState} /></dd></div>
    <div><dt>Infrastructure</dt><dd><StateBadge state={o.infrastructureState} /></dd></div>
  </dl>
</section>

<section class="overview-panel attention-panel" aria-label="Status detail">
  <div class="section-heading compact"><h2>{o.attentionTitle}</h2><a href="/services">All services</a></div>
  {#if o.attention.length}
    <ul class="attention-list">
      {#each o.attention as s}
        <li><StateBadge state={s.check.state} /><strong>{s.target.name}</strong><span>{s.check.reason}</span></li>
      {/each}
    </ul>
  {:else}
    <p class="panel-note all-clear">{o.attentionNote}</p>
  {/if}
</section>

<section class="section">
  <div class="section-heading">
    <div><h2>Sites and apps</h2><p class="section-note">Each bar is the main public check, one cell per day (EST). Hover a cell for that day's counts.</p></div>
    <a href="/projects">Repositories</a>
  </div>
  <div class="site-grid">
    {#each o.sites as site}<SiteCard {site} />{/each}
  </div>
</section>

<section class="section">
  <div class="section-heading">
    <div><h2>{o.groupsTitle}</h2><p class="section-note">Every check in each category combined; a day shows the worst state recorded on it.</p></div>
    <a href="/services">Service details</a>
  </div>
  <div class="system-list">
    {#each o.categories as g}
      <article class="system-row">
        <div class="system-row-heading"><h3><a href="/services#{anchor(g.name)}">{g.name}</a></h3><span>{g.services.length} checks</span><StateBadge state={g.state} /></div>
        <HistoryBar track={g.track} label={g.name} />
      </article>
    {/each}
  </div>
</section>
