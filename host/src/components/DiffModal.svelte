<script lang="ts" module>
  // Compact value-diff modal — invoked from AuditTimeline when an
  // operator wants to see what changed between two audit events. Both
  // events come in as `AuditEvent` from api.ts; we parse the encoded
  // `value` field and try a structural diff when both sides look like
  // objects/arrays. Falls back to a side-by-side string view.

  export type DiffKind = "primitive" | "object" | "array" | "mixed";
  export interface KeyDiff {
    key: string;
    status: "added" | "removed" | "changed" | "same";
    left: unknown;
    right: unknown;
  }
</script>

<script lang="ts">
  import type { AuditEvent } from "../lib/api";
  import { formatValue } from "../lib/format";

  interface Props {
    /** Older event (the "before" side). */
    baseline: AuditEvent;
    /** Newer event (the "after" side). */
    current: AuditEvent;
    onclose: () => void;
  }
  let { baseline, current, onclose }: Props = $props();

  function tryParse(raw: string | null): unknown {
    if (raw == null) return null;
    try { return JSON.parse(raw); } catch { return raw; }
  }

  let leftValue  = $derived(tryParse(baseline.action === "clear" ? null : baseline.value));
  let rightValue = $derived(tryParse(current.action === "clear" ? null : current.value));

  function kindOf(v: unknown): "primitive" | "object" | "array" | "null" {
    if (v === null || v === undefined) return "null";
    if (Array.isArray(v)) return "array";
    if (typeof v === "object") return "object";
    return "primitive";
  }

  let diffKind = $derived.by((): DiffKind => {
    const a = kindOf(leftValue);
    const b = kindOf(rightValue);
    if (a === b && (a === "object" || a === "array")) return a;
    if (a === "primitive" && b === "primitive") return "primitive";
    return "mixed";
  });

  let isUnchanged = $derived(JSON.stringify(leftValue) === JSON.stringify(rightValue));

  let keyDiffs = $derived.by((): KeyDiff[] => {
    if (diffKind !== "object") return [];
    const l = (leftValue ?? {}) as Record<string, unknown>;
    const r = (rightValue ?? {}) as Record<string, unknown>;
    const allKeys = Array.from(new Set([...Object.keys(l), ...Object.keys(r)])).sort();
    return allKeys.map((key): KeyDiff => {
      const hasL = key in l;
      const hasR = key in r;
      if (!hasL) return { key, status: "added", left: undefined, right: r[key] };
      if (!hasR) return { key, status: "removed", left: l[key], right: undefined };
      if (JSON.stringify(l[key]) === JSON.stringify(r[key])) {
        return { key, status: "same", left: l[key], right: r[key] };
      }
      return { key, status: "changed", left: l[key], right: r[key] };
    });
  });

  let arrayDiffs = $derived.by((): KeyDiff[] => {
    if (diffKind !== "array") return [];
    const l = (leftValue ?? []) as unknown[];
    const r = (rightValue ?? []) as unknown[];
    const n = Math.max(l.length, r.length);
    return Array.from({ length: n }, (_, i): KeyDiff => {
      const hasL = i < l.length;
      const hasR = i < r.length;
      if (!hasL) return { key: `[${i}]`, status: "added", left: undefined, right: r[i] };
      if (!hasR) return { key: `[${i}]`, status: "removed", left: l[i], right: undefined };
      if (JSON.stringify(l[i]) === JSON.stringify(r[i])) {
        return { key: `[${i}]`, status: "same", left: l[i], right: r[i] };
      }
      return { key: `[${i}]`, status: "changed", left: l[i], right: r[i] };
    });
  });

  let rows = $derived(diffKind === "object" ? keyDiffs : diffKind === "array" ? arrayDiffs : []);
  let summary = $derived.by(() => {
    if (isUnchanged) return { added: 0, removed: 0, changed: 0 };
    const c = { added: 0, removed: 0, changed: 0 };
    for (const r of rows) {
      if (r.status === "added") c.added++;
      else if (r.status === "removed") c.removed++;
      else if (r.status === "changed") c.changed++;
    }
    return c;
  });

  function handleBackdrop(ev: MouseEvent) {
    if (ev.target === ev.currentTarget) onclose();
  }
  function handleKey(ev: KeyboardEvent) {
    if (ev.key === "Escape") onclose();
  }
</script>

<svelte:window onkeydown={handleKey} />

<div class="backdrop" role="presentation" onclick={handleBackdrop}>
  <div class="modal" role="dialog" aria-label="diff between audit events">
    <header>
      <div class="title-row">
        <h2>Compare revisions</h2>
        <span class="key"><code>{baseline.key}</code></span>
      </div>
      <button class="close" onclick={onclose} aria-label="close">×</button>
    </header>

    <div class="meta">
      <div class="side left">
        <span class="side-label">baseline</span>
        <span class="actor">{baseline.actor}</span>
        <span class="env">env=<code>{baseline.env}</code></span>
        <span class="ts" title={baseline.ts}>{new Date(baseline.ts).toLocaleString()}</span>
      </div>
      <div class="arrow">→</div>
      <div class="side right">
        <span class="side-label">current</span>
        <span class="actor">{current.actor}</span>
        <span class="env">env=<code>{current.env}</code></span>
        <span class="ts" title={current.ts}>{new Date(current.ts).toLocaleString()}</span>
      </div>
    </div>

    {#if isUnchanged}
      <div class="banner same">Values are identical.</div>
    {:else if diffKind === "object" || diffKind === "array"}
      <div class="banner">
        <span class="diff-pill added" title="keys present in current but not baseline">+{summary.added} added</span>
        <span class="diff-pill removed" title="keys present in baseline but not current">−{summary.removed} removed</span>
        <span class="diff-pill changed" title="keys present in both, different value">~{summary.changed} changed</span>
      </div>
    {/if}

    <div class="body">
      {#if diffKind === "object" || diffKind === "array"}
        <table>
          <thead>
            <tr><th></th><th>baseline</th><th>current</th></tr>
          </thead>
          <tbody>
            {#each rows as r (r.key)}
              {#if r.status !== "same"}
                <tr class={`row-${r.status}`}>
                  <td class="key-cell"><code>{r.key}</code></td>
                  <td class="val-cell left-cell">
                    {#if r.status === "added"}<span class="muted">∅</span>{:else}<code>{formatValue(r.left)}</code>{/if}
                  </td>
                  <td class="val-cell right-cell">
                    {#if r.status === "removed"}<span class="muted">∅</span>{:else}<code>{formatValue(r.right)}</code>{/if}
                  </td>
                </tr>
              {/if}
            {/each}
            {#each rows.filter((r) => r.status === "same") as r (r.key)}
              <tr class="row-same">
                <td class="key-cell"><code>{r.key}</code></td>
                <td class="val-cell left-cell"><code>{formatValue(r.left)}</code></td>
                <td class="val-cell right-cell"><code>{formatValue(r.right)}</code></td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <div class="primitive-grid">
          <div class="primitive">
            <span class="side-label">baseline</span>
            <code class="big">{formatValue(leftValue)}</code>
          </div>
          <div class="big-arrow">→</div>
          <div class="primitive">
            <span class="side-label">current</span>
            <code class="big">{formatValue(rightValue)}</code>
          </div>
        </div>
      {/if}
    </div>

    <footer>
      <span class="hint">esc · backdrop click · × — to close</span>
    </footer>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(10, 12, 16, 0.75);
    backdrop-filter: blur(4px);
    display: grid;
    place-items: center;
    z-index: 100;
    padding: 24px;
    font-family: -apple-system, "Inter", system-ui, sans-serif;
  }
  .modal {
    background: #0f1115;
    border: 1px solid #2a2f3c;
    border-radius: 14px;
    max-width: 880px;
    width: 100%;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 24px 60px -20px rgba(0, 0, 0, 0.6);
    color: #e6e8ee;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 16px 20px;
    border-bottom: 1px solid #2a2f3c;
    background: rgba(255, 255, 255, 0.02);
  }
  .title-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #fcd34d;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .key code {
    font-family: ui-monospace, "JetBrains Mono", Menlo, monospace;
    font-size: 13px;
    color: #6ee7b7;
  }
  .close {
    background: transparent;
    border: 1px solid #2a2f3c;
    color: #8a92a6;
    border-radius: 8px;
    width: 32px;
    height: 32px;
    font-size: 20px;
    cursor: pointer;
    line-height: 1;
    transition: background 0.12s ease, color 0.12s ease;
  }
  .close:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #e6e8ee;
  }
  .meta {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 16px;
    padding: 12px 20px;
    border-bottom: 1px solid #2a2f3c;
    background: #0a0d12;
    align-items: center;
  }
  .side {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    font-size: 11px;
    color: #8a92a6;
  }
  .side.right { justify-content: flex-end; }
  .side-label {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #5b637a;
    font-size: 9px;
    font-weight: 700;
  }
  .actor {
    color: #e6e8ee;
    font-weight: 500;
  }
  .env code {
    font-family: ui-monospace, monospace;
    color: #8a92a6;
    font-size: 11px;
  }
  .ts {
    font-family: ui-monospace, monospace;
    color: #5b637a;
    font-size: 11px;
  }
  .arrow {
    color: #5b637a;
    font-size: 18px;
  }
  .banner {
    display: flex;
    gap: 10px;
    padding: 10px 20px;
    background: #161922;
    border-bottom: 1px solid #1c1f29;
    font-size: 11px;
  }
  .banner.same {
    color: #6ee7b7;
    background: rgba(110, 231, 183, 0.06);
    font-style: italic;
  }
  .diff-pill {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: 999px;
    font-family: ui-monospace, monospace;
    font-size: 11px;
    font-weight: 600;
    border: 1px solid;
  }
  .diff-pill.added   { color: #6ee7b7; border-color: rgba(110,231,183,0.4); background: rgba(110,231,183,0.06); }
  .diff-pill.removed { color: #fca5a5; border-color: rgba(248,113,113,0.4); background: rgba(248,113,113,0.06); }
  .diff-pill.changed { color: #fcd34d; border-color: rgba(252,211,77,0.4); background: rgba(252,211,77,0.06); }
  .body {
    flex: 1;
    overflow: auto;
    padding: 16px 20px;
    min-height: 100px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  th {
    text-align: left;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #5b637a;
    padding: 6px 10px;
    border-bottom: 1px solid #2a2f3c;
    font-weight: 600;
  }
  td {
    padding: 8px 10px;
    border-bottom: 1px solid #1c1f29;
    vertical-align: top;
  }
  td code {
    font-family: ui-monospace, "JetBrains Mono", Menlo, monospace;
    font-size: 12px;
    color: #e6e8ee;
    word-break: break-all;
  }
  .key-cell code {
    color: #8a92a6;
    font-weight: 600;
  }
  tr.row-added .right-cell { background: rgba(110, 231, 183, 0.05); }
  tr.row-added .right-cell code { color: #6ee7b7; }
  tr.row-removed .left-cell { background: rgba(248, 113, 113, 0.05); }
  tr.row-removed .left-cell code { color: #fca5a5; text-decoration: line-through; }
  tr.row-changed .left-cell { background: rgba(248, 113, 113, 0.05); }
  tr.row-changed .left-cell code { color: #fca5a5; text-decoration: line-through; }
  tr.row-changed .right-cell { background: rgba(252, 211, 77, 0.05); }
  tr.row-changed .right-cell code { color: #fcd34d; }
  tr.row-same { opacity: 0.55; }
  tr.row-same code { color: #5b637a; }
  .muted { color: #3a4150; font-style: italic; }
  .primitive-grid {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 16px;
    align-items: center;
  }
  .primitive {
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: #0a0d12;
    border: 1px solid #2a2f3c;
    border-radius: 10px;
    padding: 16px;
  }
  .primitive .big {
    font-family: ui-monospace, monospace;
    font-size: 16px;
    color: #fcd34d;
    word-break: break-all;
  }
  .big-arrow {
    font-size: 24px;
    color: #5b637a;
  }
  footer {
    padding: 10px 20px;
    border-top: 1px solid #1c1f29;
    background: rgba(255, 255, 255, 0.02);
    text-align: center;
  }
  .hint {
    color: #5b637a;
    font-size: 11px;
    font-family: ui-monospace, monospace;
  }
</style>
