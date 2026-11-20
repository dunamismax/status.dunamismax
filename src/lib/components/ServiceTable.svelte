<script lang="ts">
  import { displayTime, type Service } from '../model.js';
  import { latency } from '../view.js';
  import ServiceName from './ServiceName.svelte';
  import StateBadge from './StateBadge.svelte';
  let { services }: { services: Service[] } = $props();
</script>

<div class="table-wrap">
  <table class="status-table">
    <thead><tr>{#each ['Service', 'State', 'Latency', 'Last checked', 'Reason'] as h}<th scope="col">{h}</th>{/each}</tr></thead>
    <tbody>
      {#each services as s}
        <tr>
          <th scope="row"><ServiceName name={s.target.name} url={s.target.public_url} /><span>{s.target.group}</span></th>
          <td><StateBadge state={s.check.state} /></td>
          <td>{latency(s.check.latency_ms)}</td>
          <td>{displayTime(s.check.checked_at)}</td>
          <td>{s.check.reason}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
