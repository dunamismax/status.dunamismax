<script lang="ts">
  import Section from '#lib/components/Section.svelte';
  import ServiceTable from '#lib/components/ServiceTable.svelte';
  import type { PageProps } from './$types';
  let { data }: PageProps = $props();
</script>

<Section title="Monitored services"><ServiceTable services={data.services} /></Section>
