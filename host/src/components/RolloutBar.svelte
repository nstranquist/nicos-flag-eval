<script lang="ts">
  // 100-segment stacked bar for percentage rollouts. Bucket cursor shows
  // where a specific user lands (FNV-1a hash output mapped to 0-100) so
  // a developer can answer "am I in the on-bucket?" at a glance.

  interface Props {
    /** 0-100 on-share. */
    percentage: number;
    /** 0-100 — the bucket position for the current user (sticky-bucket hash output). */
    bucketCursor?: number;
    /** Optional secondary range used by namespace rollouts: rollout
     *  applies only within [namespaceRange[0]*100, namespaceRange[1]*100]. */
    namespaceRange?: [number, number];
    hashKey?: string;
    compact?: boolean;
  }
  let {
    percentage,
    bucketCursor,
    namespaceRange,
    hashKey = "userId",
    compact = false,
  }: Props = $props();

  let clamped = $derived(Math.max(0, Math.min(100, percentage)));
  let nsStart = $derived(namespaceRange ? namespaceRange[0] * 100 : 0);
  let nsEnd = $derived(namespaceRange ? namespaceRange[1] * 100 : 100);
  let nsWidth = $derived(nsEnd - nsStart);
  // Cursor falls into the on-bucket when within [nsStart, nsStart + nsWidth * pct/100).
  let onUpper = $derived(nsStart + (nsWidth * clamped) / 100);
  let cursorOn = $derived(
    bucketCursor !== undefined && bucketCursor >= nsStart && bucketCursor < onUpper,
  );
</script>

<div class="rollout" class:compact>
  <div class="bar" role="img" aria-label={`${clamped}% rollout`}>
    {#if namespaceRange && nsStart > 0}
      <div class="seg off" style:width="{nsStart}%" title="outside namespace"></div>
    {/if}
    <div class="seg on" style:width="{nsWidth * (clamped / 100)}%" title={`${clamped}% on`}></div>
    <div class="seg off" style:width="{nsWidth * (1 - clamped / 100)}%" title={`${(100 - clamped).toFixed(0)}% off`}></div>
    {#if namespaceRange && nsEnd < 100}
      <div class="seg off" style:width="{100 - nsEnd}%" title="outside namespace"></div>
    {/if}

    {#if bucketCursor !== undefined}
      <div class="cursor" class:on={cursorOn} style:left="{bucketCursor}%" title={`bucket ${bucketCursor.toFixed(1)} (${cursorOn ? "on" : "off"})`}></div>
    {/if}
  </div>

  {#if !compact}
    <div class="legend">
      <span class="ticker">
        <strong class="pct">{clamped.toFixed(0)}%</strong>
        <span class="muted">on · hashed by <code>{hashKey}</code></span>
      </span>
      {#if bucketCursor !== undefined}
        <span class="bucket" class:on={cursorOn}>
          bucket <code>{bucketCursor.toFixed(1)}</code> → <strong>{cursorOn ? "on" : "off"}</strong>
        </span>
      {/if}
      {#if namespaceRange}
        <span class="muted">ns window [{(namespaceRange[0] * 100).toFixed(0)}, {(namespaceRange[1] * 100).toFixed(0)})</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .rollout {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-family: -apple-system, "Inter", system-ui, sans-serif;
  }
  .bar {
    position: relative;
    display: flex;
    height: 14px;
    border-radius: 999px;
    overflow: hidden;
    background: #1c1f29;
    border: 1px solid #2a2f3c;
  }
  .compact .bar {
    height: 8px;
  }
  .seg {
    height: 100%;
  }
  .seg.on {
    background: linear-gradient(180deg, #6ee7b7, #34d399);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.15);
  }
  .seg.off {
    background: transparent;
  }
  .cursor {
    position: absolute;
    top: -2px;
    bottom: -2px;
    width: 2px;
    background: #fcd34d;
    box-shadow: 0 0 6px rgba(252, 211, 77, 0.7);
    transform: translateX(-1px);
  }
  .cursor.on {
    background: #6ee7b7;
    box-shadow: 0 0 8px rgba(110, 231, 183, 0.8);
  }
  .legend {
    display: flex;
    align-items: center;
    gap: 14px;
    font-size: 11px;
    color: #8a92a6;
    flex-wrap: wrap;
  }
  .ticker {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .pct {
    color: #6ee7b7;
    font-family: ui-monospace, "JetBrains Mono", Menlo, monospace;
    font-size: 13px;
    letter-spacing: -0.01em;
  }
  .muted {
    color: #5b637a;
  }
  .muted code {
    font-family: ui-monospace, monospace;
    color: #8a92a6;
  }
  .bucket {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(252, 211, 77, 0.1);
    border: 1px solid rgba(252, 211, 77, 0.3);
    color: #fcd34d;
  }
  .bucket.on {
    background: rgba(110, 231, 183, 0.1);
    border-color: rgba(110, 231, 183, 0.4);
    color: #6ee7b7;
  }
  .bucket code {
    font-family: ui-monospace, monospace;
    font-weight: 600;
  }
</style>
