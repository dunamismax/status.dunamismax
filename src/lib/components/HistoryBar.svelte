<script lang="ts">
  // One cell per EST day, oldest first. The cells are decorative for assistive
  // technology; the summary line carries the same information as text.
  import type { Track } from '../view.js';
  let { track, label }: { track: Track | null; label: string } = $props();
</script>

{#if track}
  <div class="history">
    <ol class="history-days" aria-hidden="true">{#each track.days as d}<li class="day day-{d.state}" title={d.label}></li>{/each}</ol>
    <p class="history-legend"><span><span class="wide-only">{track.days.length} days ago</span><span class="narrow-only">30 days ago</span></span><span class="history-summary"><span class="sr-only">{label}: </span>{track.summary}</span><span>Today</span></p>
  </div>
{:else}
  <p class="history-missing">Daily history is unavailable right now.</p>
{/if}
