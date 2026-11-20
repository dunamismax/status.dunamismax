<script lang="ts">
  import type { Snippet } from 'svelte';
  let { title, children }: { title: string; children: Snippet } = $props();
</script>

<section class="section first-section">
  <div class="section-heading"><h1>{title}</h1></div>
  {@render children()}
</section>
