<script lang="ts">
  // Plain text table: the first cell of each row is its row header.
  let { head, rows, empty }: { head: string[]; rows: string[][]; empty: string } = $props();
</script>

{#if rows.length}
  <div class="table-wrap">
    <table class="status-table">
      <thead><tr>{#each head as h}<th scope="col">{h}</th>{/each}</tr></thead>
      <tbody>
        {#each rows as row}
          <tr>{#each row as cell, i}{#if i}<td>{cell}</td>{:else}<th scope="row">{cell}</th>{/if}{/each}</tr>
        {/each}
      </tbody>
    </table>
  </div>
{:else}
  <p class="empty-state">{empty}</p>
{/if}
