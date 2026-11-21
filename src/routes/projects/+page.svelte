<script lang="ts">
  import { buildNext, projectFacts, segments } from '#lib/view.js';
  import ServiceName from '#lib/components/ServiceName.svelte';
  import StateBadge from '#lib/components/StateBadge.svelte';
  import type { PageProps } from './$types';
  let { data }: PageProps = $props();
</script>

<section class="section first-section">
  <div class="section-heading">
    <div><h1>Projects</h1><p class="lede">{data.projects.length} repositories, read without fetching: branch, upstream, worktree, latest commit and BUILD.md progress.</p></div>
  </div>
  <div class="project-grid">
    {#each data.projects as p}
      <article class="project-card is-{p.state}">
        <div class="project-card-header"><h2><ServiceName name={p.target.name} url={p.target.public_url} /></h2><StateBadge state={p.state} /></div>
        <p>{p.reason}</p>
        {#if p.build}
          <div class="build-progress">
            <div class="build-progress-label"><span>BUILD.md</span><strong>{p.build.checked}/{p.build.total}</strong></div>
            <ol class="segments" aria-hidden="true">{#each segments(p.build.checked, p.build.total) as on}<li class={on ? 'on' : ''}></li>{/each}</ol>
            <p class="build-next">{buildNext(p.build)}</p>
          </div>
        {/if}
        <dl>{#each projectFacts(p) as [k, v]}<div><dt>{k}</dt><dd>{v}</dd></div>{/each}</dl>
      </article>
    {/each}
  </div>
  {#if !data.projects.length}<p class="empty-state">No repositories have been checked yet.</p>{/if}
</section>
