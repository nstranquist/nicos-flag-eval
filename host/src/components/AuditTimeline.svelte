<script lang="ts">
  import { fetchAudit, type AuditEvent } from "../lib/api";
  import DiffModal from "./DiffModal.svelte";

  interface Props {
    flagKey: string;
    /** Bumped by parent after a save/clear → triggers refresh */
    refreshToken: number;
  }
  let { flagKey, refreshToken }: Props = $props();

  let events: AuditEvent[] = $state([]);
  let loading = $state(true);
  let err = $state("");

  // Diff modal state — `baseline` is the older side (selected via shift+click),
  // `diffWith` is the newer side that opens the modal when clicked while a
  // baseline is set.
  let baseline: AuditEvent | null = $state(null);
  let diffWith: AuditEvent | null = $state(null);

  async function load() {
    loading = true;
    err = "";
    try {
      events = await fetchAudit(flagKey, 25);
    } catch (e) {
      err = String(e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void flagKey; void refreshToken;
    load();
  });

  function relative(ts: string): string {
    const t = new Date(ts).getTime();
    const diff = Date.now() - t;
    if (diff < 60_000) return "just now";
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  }

  function handleEventClick(ev: AuditEvent, mouseEv: MouseEvent) {
    if (mouseEv.shiftKey) {
      // Toggle baseline selection.
      baseline = baseline?.id === ev.id ? null : ev;
      return;
    }
    if (!baseline) {
      // Plain click without a baseline: diff against the previous event
      // in the list (older one). If this is the oldest, diff against
      // null-shaped synthetic to surface the create event.
      const idx = events.findIndex((e) => e.id === ev.id);
      const prior = idx >= 0 && idx < events.length - 1 ? events[idx + 1] : ev;
      baseline = prior;
      diffWith = ev;
      return;
    }
    if (baseline.id === ev.id) {
      // Clicking the baseline plain → clear it.
      baseline = null;
      return;
    }
    // Open diff: oldest of the two is baseline, newest is diffWith.
    const a = new Date(baseline.ts).getTime();
    const b = new Date(ev.ts).getTime();
    if (a <= b) {
      diffWith = ev;
    } else {
      diffWith = baseline;
      baseline = ev;
    }
  }

  function closeDiff() {
    diffWith = null;
  }
</script>

<section class="audit">
  <header class="audit-head">
    <h3>Audit timeline</h3>
    {#if events.length > 1}
      <span class="diff-hint" title="shift+click to set baseline, then click any other row to diff">
        {#if baseline}
          <span class="bl-pill">baseline · #{baseline.id}</span>
          <button class="bl-clear" onclick={() => (baseline = null)} aria-label="clear baseline">×</button>
        {:else}
          <kbd>⇧</kbd>+click to set baseline · click to diff vs prior
        {/if}
      </span>
    {/if}
  </header>
  {#if loading}
    <div class="hint">…</div>
  {:else if err}
    <div class="err">{err}</div>
  {:else if events.length === 0}
    <div class="hint">No changes yet for this flag.</div>
  {:else}
    <ol>
      {#each events as ev (ev.id)}
        {@const isBaseline = baseline?.id === ev.id}
        <li>
          <button
            class="event"
            class:set={ev.action === "set"}
            class:clear={ev.action === "clear"}
            class:baseline={isBaseline}
            onclick={(mev) => handleEventClick(ev, mev)}
            aria-label={`event ${ev.id} — ${isBaseline ? "baseline selected" : "click to diff"}`}
          >
            <span class="dot"></span>
            <div class="body">
              <div class="line1">
                <span class="action">{ev.action}</span>
                <span class="actor">{ev.actor}</span>
                <span class="env">env=<code>{ev.env}</code></span>
                {#if isBaseline}<span class="baseline-pill">baseline</span>{/if}
                <span class="ts" title={ev.ts}>{relative(ev.ts)}</span>
              </div>
              {#if ev.action === "set" && ev.value}
                <div class="line2">
                  {#if ev.prev}<code class="prev">{ev.prev}</code><span class="arrow">→</span>{/if}
                  <code class="new">{ev.value}</code>
                </div>
              {/if}
              {#if ev.reason}<div class="reason">"{ev.reason}"</div>{/if}
            </div>
          </button>
        </li>
      {/each}
    </ol>
  {/if}
</section>

{#if diffWith && baseline}
  <DiffModal baseline={baseline} current={diffWith} onclose={closeDiff} />
{/if}

<style>
  .audit {
    background: #161922;
    border: 1px solid #2a2f3c;
    border-radius: 12px;
    padding: 16px 20px;
  }
  .audit-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }
  h3 {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #fcd34d;
  }
  .diff-hint {
    font-size: 10px;
    color: #5b637a;
    font-family: ui-monospace, monospace;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .diff-hint kbd {
    background: #0a0d12;
    border: 1px solid #2a2f3c;
    border-bottom-width: 2px;
    border-radius: 4px;
    padding: 0 4px;
    color: #8a92a6;
    font-family: ui-monospace, monospace;
    font-size: 10px;
  }
  .bl-pill {
    background: rgba(252, 211, 77, 0.12);
    color: #fcd34d;
    border: 1px solid rgba(252, 211, 77, 0.4);
    padding: 2px 8px;
    border-radius: 999px;
    font-weight: 600;
  }
  .bl-clear {
    background: transparent;
    border: 0;
    color: #5b637a;
    cursor: pointer;
    font-size: 12px;
    padding: 0;
  }
  .bl-clear:hover { color: #fca5a5; }
  .event {
    background: transparent;
    border: 0;
    color: inherit;
    padding: 0;
    text-align: left;
    width: 100%;
    cursor: pointer;
    border-radius: 6px;
    transition: background 0.12s ease, box-shadow 0.12s ease;
  }
  .event:hover {
    background: rgba(255, 255, 255, 0.02);
  }
  .event.baseline {
    background: rgba(252, 211, 77, 0.05);
    box-shadow: inset 2px 0 0 #fcd34d;
  }
  .baseline-pill {
    background: rgba(252, 211, 77, 0.14);
    color: #fcd34d;
    border: 1px solid rgba(252, 211, 77, 0.4);
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 700;
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    position: relative;
  }
  ol::before {
    content: "";
    position: absolute;
    left: 4px;
    top: 6px;
    bottom: 6px;
    width: 1px;
    background: #2a2f3c;
  }
  .event {
    display: grid;
    grid-template-columns: 18px 1fr;
    gap: 10px;
    align-items: start;
    position: relative;
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 999px;
    background: #2a2f3c;
    border: 2px solid #161922;
    margin-top: 4px;
    z-index: 1;
  }
  .event.set .dot {
    background: #fcd34d;
    box-shadow: 0 0 6px rgba(252,211,77,0.5);
  }
  .event.clear .dot {
    background: #8a92a6;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .line1 {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    flex-wrap: wrap;
  }
  .action {
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 4px;
    font-weight: 600;
  }
  .event.set .action {
    background: rgba(252, 211, 77, 0.15);
    color: #fcd34d;
  }
  .event.clear .action {
    background: rgba(138, 146, 166, 0.15);
    color: #8a92a6;
  }
  .actor {
    color: #e6e8ee;
    font-weight: 500;
  }
  .env {
    color: #5b637a;
    font-size: 11px;
  }
  .env code {
    font-family: ui-monospace, monospace;
    color: #8a92a6;
  }
  .ts {
    margin-left: auto;
    color: #5b637a;
    font-size: 11px;
  }
  .line2 {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }
  code {
    font-family: ui-monospace, monospace;
  }
  .prev {
    color: #5b637a;
    text-decoration: line-through;
  }
  .arrow {
    color: #5b637a;
  }
  .new {
    color: #6ee7b7;
  }
  .reason {
    color: #8a92a6;
    font-style: italic;
    font-size: 12px;
  }
  .hint, .err {
    color: #5b637a;
    font-style: italic;
    padding: 8px 0;
    font-size: 13px;
  }
  .err {
    color: #f87171;
  }
</style>
