<script lang="ts">
  import { sourceColor, type EvalSource } from "../lib/format";

  interface Props {
    source: EvalSource;
  }
  let { source }: Props = $props();

  const TIERS: { source: EvalSource; label: string; group: string }[] = [
    { source: "process-flag",      label: "Process flag",       group: "Caller" },
    { source: "env",               label: "Env var",            group: "Caller" },
    { source: "personal-override", label: "Personal override",  group: "Machine" },
    { source: "repo-override",     label: "Repo override",      group: "Repo" },
    { source: "cloud-override",    label: "Cloud override",     group: "Cloud" },
    { source: "sticky-bucket",     label: "Sticky bucket",      group: "Cloud" },
    { source: "force-exclude",     label: "Force exclude",      group: "Pinned" },
    { source: "force-include",     label: "Force include",      group: "Pinned" },
    { source: "legacy-gate",       label: "Legacy gate",        group: "Engine" },
    { source: "rule",              label: "Rule eval",          group: "Engine" },
    { source: "kill-date",         label: "Kill date",          group: "Engine" },
    { source: "default",           label: "Manifest default",   group: "Engine" },
  ];
  const hitIndex = $derived(TIERS.findIndex((t) => t.source === source));
</script>

<div class="chain">
  <div class="header">Resolution chain</div>
  <ol>
    {#each TIERS as tier, i}
      {@const isHit = i === hitIndex}
      {@const isPast = hitIndex >= 0 && i < hitIndex}
      {@const c = sourceColor(tier.source)}
      <li class:hit={isHit} class:past={isPast} style:--ring={c.ring} style:--fg={c.fg} style:--bg={c.bg}>
        <span class="num">{i + 1}</span>
        <span class="dot"></span>
        <span class="label">{tier.label}</span>
        <span class="group">{tier.group}</span>
        {#if isHit}<span class="arrow">←</span>{/if}
      </li>
    {/each}
  </ol>
</div>

<style>
  .chain {
    background: #0a0d12;
    border: 1px solid #2a2f3c;
    border-radius: 12px;
    padding: 16px 20px;
  }
  .header {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #8a92a6;
    margin-bottom: 12px;
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  li {
    display: grid;
    grid-template-columns: 28px 16px 1fr auto auto;
    align-items: center;
    gap: 10px;
    padding: 5px 8px;
    border-radius: 6px;
    font-size: 12px;
    color: #5b637a;
    transition: background 0.15s ease, color 0.15s ease;
  }
  li.past {
    color: #3a4150;
  }
  li.hit {
    background: var(--bg);
    color: #e6e8ee;
    box-shadow: 0 0 0 1px var(--ring);
  }
  .num {
    text-align: right;
    font-family: ui-monospace, "JetBrains Mono", Menlo, monospace;
    font-size: 11px;
    color: #5b637a;
  }
  li.hit .num {
    color: var(--fg);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: #2a2f3c;
    margin: 0 4px;
  }
  li.hit .dot {
    background: var(--ring);
    box-shadow: 0 0 8px var(--ring);
  }
  .label {
    font-weight: 500;
  }
  .group {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #5b637a;
  }
  .arrow {
    color: var(--fg);
    font-weight: 700;
    font-size: 14px;
  }
</style>
