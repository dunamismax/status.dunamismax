<script lang="ts">
  import { safeUrl } from '../view.js';
  let { name, url }: { name: string; url: string | null } = $props();
</script>

{#if url}<a href={safeUrl(url)}>{name}</a>{:else}{name}{/if}
