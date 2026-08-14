<script lang="ts">
  import { sourceColor, type EvalSource } from "../lib/format";
  interface Props {
    source: EvalSource;
    compact?: boolean;
  }
  let { source, compact = false }: Props = $props();
  let c = $derived(sourceColor(source));
</script>

<span class="badge" class:compact style:background={c.bg} style:color={c.fg} style:border-color={c.ring}>
  {source}
</span>

<style>
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid;
    font-family: ui-monospace, "JetBrains Mono", Menlo, monospace;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.02em;
    white-space: nowrap;
  }
  .badge.compact {
    padding: 1px 6px;
    font-size: 10px;
  }
</style>
