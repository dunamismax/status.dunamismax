<script lang="ts">
  import { displayTime } from '#lib/model.js';
  import DataTable from '#lib/components/DataTable.svelte';
  import Section from '#lib/components/Section.svelte';
  import type { PageProps } from './$types';
  let { data }: PageProps = $props();
</script>

<Section title="Deployments">
  <DataTable
    head={['Service', 'Repo', 'Commit', 'Environment', 'Deployed', 'Summary']}
    rows={data.deployments.map(v => [v.service_id ?? 'unknown', v.repo_name ?? 'unknown', v.commit_sha?.slice(0, 12) ?? 'unknown', v.environment, displayTime(v.deployed_at), v.public_summary])}
    empty="No deployment records are stored yet." />
</Section>
