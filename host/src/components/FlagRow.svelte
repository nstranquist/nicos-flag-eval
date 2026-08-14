<script lang="ts">
  import FlagBadge from "./FlagBadge.svelte";
  import Toggle from "./Toggle.svelte";
  import { formatValue, flagSummary, isOn } from "../lib/format";
  import type { FlagSpec, EvalResult } from "../lib/api";

  interface Props {
    flag: FlagSpec;
    result: EvalResult | null;
    selected: boolean;
    busy: boolean;
    hasOverride: boolean;
    onclick: () => void;
    /** Click handler for the inline toggle (booleans). The parent
     *  fires the network write and re-fetches. We just bubble the
     *  intent up so the row stays dumb. */
    ontoggle: () => void;
    /** Click for the inline value chip (string / number / json) —
     *  opens the row for full edit in the drawer. */
    oneditvalue: () => void;
  }
  let {
    flag, result, selected, busy, hasOverride,
    onclick, ontoggle, oneditvalue,
  }: Props = $props();

  let currentValue = $derived(result?.value ?? flag.default);
  let on = $derived(isOn(currentValue));
  let isBool = $derived(flag.type === "boolean");
</script>

<div class="row" class:selected class:has-override={hasOverride}>
  <button class="open" onclick={onclick} aria-label={`open ${flag.key}`}>
    <span class="meta">
      <span class="key">
        <code>{flag.key}</code>
        {#if flag._synthesized}<span class="legacy" title="synthesized from internal/feature/gates.go">legacy</span>{/if}
        {#if hasOverride}<span class="override-dot" title="cloud override active"></span>{/if}
      </span>
      {#if flag.description}
        <span class="desc">{flag.description}</span>
      {/if}
      <span class="summary">
        {#if result}<FlagBadge source={result.source} compact />{/if}
        <span class="summary-text">{flagSummary(flag)}</span>
      </span>
    </span>
  </button>

  <div class="action" onclick={(ev) => ev.stopPropagation()} role="none">
    {#if isBool}
      <Toggle
        {on}
        overridden={hasOverride}
        {busy}
        onclick={ontoggle}
        title={hasOverride ? "click to toggle (override active)" : "click to override"}
      />
    {:else}
      <button class="value-chip" class:overridden={hasOverride} onclick={oneditvalue} title="click to edit">
        <code>{formatValue(currentValue)}</code>
        <span class="edit-icon">✎</span>
      </button>
    {/if}
  </div>
</div>

<style>
  .row {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 14px;
    background: transparent;
    border-bottom: 1px solid #1c1f29;
    padding: 0 18px 0 0;
    transition: background 0.12s ease, box-shadow 0.12s ease;
  }
  .row:hover {
    background: rgba(255, 255, 255, 0.02);
  }
  .row.selected {
    background: rgba(110, 231, 183, 0.05);
    box-shadow: inset 3px 0 0 #6ee7b7;
  }
  .row.has-override {
    box-shadow: inset 3px 0 0 #fcd34d;
  }
  .row.selected.has-override {
    box-shadow: inset 3px 0 0 #fcd34d, inset 0 0 0 1px rgba(252, 211, 77, 0.1);
  }
  .open {
    display: block;
    background: transparent;
    border: 0;
    padding: 14px 0 14px 18px;
    text-align: left;
    color: inherit;
    cursor: pointer;
    min-width: 0;
  }
  .meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .key {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .key code {
    font-family: ui-monospace, "JetBrains Mono", Menlo, monospace;
    font-size: 13px;
    color: #e6e8ee;
  }
  .legacy {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #fb923c;
    border: 1px solid rgba(251, 146, 60, 0.4);
    border-radius: 4px;
    padding: 1px 5px;
  }
  .override-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: #fcd34d;
    box-shadow: 0 0 6px rgba(252, 211, 77, 0.7);
  }
  .desc {
    font-size: 12px;
    color: #8a92a6;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .summary {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .summary-text {
    font-size: 11px;
    color: #5b637a;
    font-family: ui-monospace, "JetBrains Mono", Menlo, monospace;
  }
  .action {
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }
  .value-chip {
    background: #161922;
    border: 1px solid #2a2f3c;
    border-radius: 8px;
    padding: 6px 12px;
    color: #e6e8ee;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    transition: border-color 0.12s ease, background 0.12s ease;
  }
  .value-chip:hover {
    border-color: #fcd34d;
    background: #1c2030;
  }
  .value-chip.overridden {
    border-color: rgba(252, 211, 77, 0.4);
    background: rgba(252, 211, 77, 0.04);
  }
  .value-chip code {
    font-family: ui-monospace, "JetBrains Mono", Menlo, monospace;
    font-size: 12px;
    color: #6ee7b7;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .value-chip.overridden code {
    color: #fcd34d;
  }
  .edit-icon {
    color: #5b637a;
    font-size: 11px;
  }
  .value-chip:hover .edit-icon {
    color: #fcd34d;
  }
</style>
