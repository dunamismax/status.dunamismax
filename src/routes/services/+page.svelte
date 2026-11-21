<script lang="ts">
  import { anchor } from '#lib/view.js';
  import HistoryBar from '#lib/components/HistoryBar.svelte';
  import ServiceTable from '#lib/components/ServiceTable.svelte';
  import StateBadge from '#lib/components/StateBadge.svelte';
  import type { PageProps } from './$types';
  let { data }: PageProps = $props();
</script>

<section class="section first-section">
  <div class="section-heading">
    <div><h1>Monitored services</h1><p class="lede">{data.services.length} checks in {data.groups.length} categories. The 90-day column is the share of recorded checks that were operational.</p></div>
  </div>
  <nav class="jump-nav" aria-label="Categories">
    {#each data.groups as g}<a href="#{anchor(g.name)}"><span class="dot dot-{g.state}" aria-hidden="true"></span>{g.name} <span class="group-count">{g.services.length}</span></a>{/each}
  </nav>
</section>

{#each data.groups as g}
  <section class="section service-group" id={anchor(g.name)} aria-labelledby="{anchor(g.name)}-title">
    <div class="section-heading compact">
      <h2 id="{anchor(g.name)}-title">{g.name}</h2>
      <StateBadge state={g.state} />
    </div>
    <HistoryBar track={g.track} label={g.name} />
    <ServiceTable services={g.services} uptime={data.uptime} showGroup={false} />
  </section>
{/each}
{#if !data.groups.length}<p class="empty-state">No service checks have been recorded yet.</p>{/if}
