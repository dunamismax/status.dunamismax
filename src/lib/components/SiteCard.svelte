<script lang="ts">
  import type { PropertyView } from '../view.js';
  import HistoryBar from './HistoryBar.svelte';
  import ServiceName from './ServiceName.svelte';
  import StateBadge from './StateBadge.svelte';
  let { site }: { site: PropertyView } = $props();
</script>

<article class="site-card is-{site.state}" id={site.id}>
  <div class="site-card-header">
    <div>
      <h3><ServiceName name={site.name} url={site.url} /></h3>
      <p>{site.summary}</p>
    </div>
    <StateBadge state={site.state} />
  </div>
  {#if site.primary}
    <p class="site-primary"><span class="dot dot-{site.primary.check.state}" aria-hidden="true"></span>{site.primary.target.name}: {site.primary.check.reason}{#if site.primary.check.latency_ms !== null}<span class="site-latency">{site.primary.check.latency_ms} ms</span>{/if}</p>
  {:else}
    <p class="site-primary"><span class="dot dot-unknown" aria-hidden="true"></span>No check recorded yet.</p>
  {/if}
  <HistoryBar track={site.track} label={site.name} />
  {#if site.checks.length || site.projects.length}
    <ul class="chip-list" aria-label="{site.name} checks">
      {#each site.checks as c}<li class="chip" title={c.reason}><span class="dot dot-{c.state}" aria-hidden="true"></span>{c.name}<span class="sr-only">: {c.state}, {c.reason}</span></li>{/each}
      {#each site.projects as p}<li class="chip chip-repo" title={p.reason}><span class="dot dot-{p.state}" aria-hidden="true"></span>repo {p.target.repo_name}<span class="sr-only">: {p.state}, {p.reason}</span></li>{/each}
    </ul>
  {/if}
</article>
