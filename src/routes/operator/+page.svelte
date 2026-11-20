<script lang="ts">
  import { worktree } from '#lib/view.js';
  import DataTable from '#lib/components/DataTable.svelte';
  import Section from '#lib/components/Section.svelte';
  import ServiceTable from '#lib/components/ServiceTable.svelte';
  import type { PageProps } from './$types';
  let { data }: PageProps = $props();
</script>

<Section title="Private status detail">
  <DataTable head={['Overall', 'Readiness', 'Database']} rows={[[data.snapshot.overall_state, data.ready.status, data.ready.database]]} empty="" />
</Section>
<Section title="Service checks"><ServiceTable services={data.snapshot.services} /></Section>
<Section title="Repository paths">
  <DataTable
    head={['Project', 'Repo', 'Path', 'Branch', 'Upstream', 'Worktree']}
    rows={data.snapshot.projects.map(p => [p.target.name, p.target.repo_name, `${data.repoRoot}/${p.target.repo_name}`, p.git.branch ?? 'unknown', p.git.upstream ?? 'none', worktree(p.git.dirty)])}
    empty="" />
</Section>
