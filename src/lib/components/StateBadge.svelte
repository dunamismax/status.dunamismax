<script lang="ts">
  import type { State } from '../model.js';
  let { state, label = state }: { state: State; label?: string } = $props();
</script>

<span class="state state-{state}">{label}</span>
