<script lang="ts">
  import { page } from '$app/state';
  import Section from '#lib/components/Section.svelte';
</script>

{#if page.status === 404}
  <Section title="Not found"><p class="lede">That status page is not available.</p></Section>
{:else if page.status === 503}
  <Section title="Status history is unavailable"><p class="lede">Stored status results cannot be read right now, so no state is shown. Please try again shortly.</p></Section>
{:else}
  <Section title="Status page error"><p class="lede">This page could not be rendered. Please try again shortly.</p></Section>
{/if}
