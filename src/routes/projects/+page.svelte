<script lang="ts">
  import { projectFacts } from '#lib/view.js';
  import Section from '#lib/components/Section.svelte';
  import ServiceName from '#lib/components/ServiceName.svelte';
  import StateBadge from '#lib/components/StateBadge.svelte';
  import type { PageProps } from './$types';
  let { data }: PageProps = $props();
</script>

<Section title="Projects">
  <div class="project-grid">
    {#each data.projects as p}
      <article class="project-card">
        <div class="project-card-header"><h2><ServiceName name={p.target.name} url={p.target.public_url} /></h2><StateBadge state={p.state} /></div>
        <p>{p.reason}</p>
        <dl>{#each projectFacts(p) as [k, v]}<div><dt>{k}</dt><dd>{v}</dd></div>{/each}</dl>
      </article>
    {/each}
  </div>
</Section>
