<script lang="ts">
  import { displayTime } from '#lib/model.js';
  import DataTable from '#lib/components/DataTable.svelte';
  import Section from '#lib/components/Section.svelte';
  import type { PageProps } from './$types';
  let { data }: PageProps = $props();
</script>

<Section title="Incidents">
  <DataTable
    head={['Incident', 'State', 'Affected', 'Started', 'Resolved', 'Notes']}
    rows={data.incidents.map(v => [v.title, v.state, v.affected_targets.join(', '), displayTime(v.started_at), v.resolved_at ? displayTime(v.resolved_at) : 'open', v.public_notes])}
    empty="No incident records are stored yet." />
</Section>
<Section title="Maintenance">
  <DataTable
    head={['Window', 'State', 'Affected', 'Starts', 'Ends', 'Notes']}
    rows={data.maintenance.map(v => [v.title, v.state, v.affected_targets.join(', '), displayTime(v.starts_at), displayTime(v.ends_at), v.public_notes])}
    empty="No maintenance windows are stored yet." />
</Section>
