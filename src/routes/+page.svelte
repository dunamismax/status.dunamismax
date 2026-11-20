<script lang="ts">
  import { displayTime } from '#lib/model.js';
  import { latency } from '#lib/view.js';
  import ServiceName from '#lib/components/ServiceName.svelte';
  import StateBadge from '#lib/components/StateBadge.svelte';
  import type { PageProps } from './$types';
  let { data }: PageProps = $props();
  const o = $derived(data.overview);
</script>

<section class="status-band is-{o.publicState}">
  <div>
    <p class="eyebrow">Public availability</p>
    <h1>{o.headline}</h1>
    <dl class="status-meta">
      <div><dt>Last checked</dt><dd>{o.lastChecked}</dd></div>
      <div><dt>Public HTTP checks</dt><dd>{o.publicChecks}</dd></div>
    </dl>
  </div>
  <dl class="health-summary">
    <div><dt>Backups and maintenance</dt><dd><StateBadge state={o.maintenanceState} /></dd></div>
    <div><dt>Infrastructure</dt><dd><StateBadge state={o.infrastructureState} /></dd></div>
  </dl>
</section>

<section class="overview-grid" aria-label="Status detail">
  <article class="overview-panel">
    <div class="section-heading compact"><h2>{o.attentionTitle}</h2><a href="/services">View all</a></div>
    {#if o.attention.length}
      <ul class="attention-list">
        {#each o.attention as s}
          <li><StateBadge state={s.check.state} /><strong>{s.target.name}</strong><span>{s.check.reason}</span></li>
        {/each}
      </ul>
    {:else}
      <p class="panel-note">{o.attentionNote}</p>
    {/if}
  </article>
  <article class="overview-panel">
    <div class="section-heading compact"><h2>{o.groupsTitle}</h2><a href="/projects">Projects</a></div>
    <ul class="group-list">
      {#each o.groups as g}<li><span>{g.name}</span><StateBadge state={g.state} /></li>{/each}
    </ul>
  </article>
</section>

<section class="section">
  <div class="section-heading"><h2>Monitored services by category</h2><a href="/services">Service details</a></div>
  <div class="service-section-grid">
    {#each o.categories as g}
      <section class="service-category" aria-label={g.name}>
        <div class="service-category-heading">
          <div><h3>{g.name}</h3><p>{g.services.length} checks</p></div>
          <StateBadge state={g.state} />
        </div>
        <div class="service-card-grid">
          {#each g.services as s}
            <article class="service-card">
              <div class="service-card-title"><h4><ServiceName name={s.target.name} url={s.target.public_url} /></h4><StateBadge state={s.check.state} /></div>
              <p>{s.check.reason}</p>
              <dl>
                <div><dt>Latency</dt><dd>{latency(s.check.latency_ms)}</dd></div>
                <div><dt>Checked</dt><dd>{displayTime(s.check.checked_at)}</dd></div>
              </dl>
            </article>
          {/each}
        </div>
      </section>
    {/each}
  </div>
</section>
