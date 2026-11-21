<script lang="ts">
  import { displayTime, type Service } from '../model.js';
  import { latency } from '../view.js';
  import ServiceName from './ServiceName.svelte';
  import StateBadge from './StateBadge.svelte';
  let { services, uptime = null, showGroup = true }: { services: Service[]; uptime?: Record<string, string> | null; showGroup?: boolean } = $props();
</script>

<div class="table-wrap">
  <table class="status-table">
    <thead><tr>{#each ['Service', 'State', ...(uptime ? ['90 days'] : []), 'Latency', 'Last checked', 'Reason'] as h}<th scope="col">{h}</th>{/each}</tr></thead>
    <tbody>
      {#each services as s}
        <tr class="row-{s.check.state}">
          <th scope="row"><ServiceName name={s.target.name} url={s.target.public_url} />{#if showGroup}<span>{s.target.group}</span>{/if}</th>
          <td><StateBadge state={s.check.state} /></td>
          {#if uptime}<td class="numeric">{uptime[s.target.id] ?? 'No data'}</td>{/if}
          <td class="numeric">{latency(s.check.latency_ms)}</td>
          <td>{displayTime(s.check.checked_at)}</td>
          <td>{s.check.reason}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
