<script lang="ts" module>
  // Wire shape — the `if` field on a manifest rule. Real flags today
  // ship one of two shapes:
  //   { env: "iat" }                                // env equality
  //   { attr: { is_internal: "true" } }             // attr equality (multi-key = implicit AND)
  // Unknown top-level keys render as raw <key>: <json> chips so the
  // schema can evolve without this component going blind.
  export interface Condition {
    env?: string;
    attr?: Record<string, string>;
    [k: string]: unknown;
  }
</script>

<script lang="ts">
  interface Props {
    condition: Condition;
  }
  let { condition }: Props = $props();

  type Clause = { kind: "env" | "attr" | "other"; key: string; value: string };

  let clauses = $derived.by((): Clause[] => {
    const out: Clause[] = [];
    if (condition.env !== undefined) {
      out.push({ kind: "env", key: "env", value: String(condition.env) });
    }
    if (condition.attr && typeof condition.attr === "object") {
      for (const [k, v] of Object.entries(condition.attr)) {
        out.push({ kind: "attr", key: k, value: String(v) });
      }
    }
    for (const [k, v] of Object.entries(condition)) {
      if (k === "env" || k === "attr") continue;
      out.push({ kind: "other", key: k, value: JSON.stringify(v) });
    }
    return out;
  });
</script>

<div class="cond" role="group" aria-label="rule condition">
  {#if clauses.length === 0}
    <span class="empty">always</span>
  {:else}
    {#each clauses as c, i (c.key + i)}
      {#if i > 0}<span class="op">AND</span>{/if}
      <span class="chip kind-{c.kind}">
        <code class="lhs">{c.key}</code>
        <span class="eq">==</span>
        <code class="rhs">{c.value}</code>
      </span>
    {/each}
  {/if}
</div>

<style>
  .cond {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    font-family: -apple-system, "Inter", system-ui, sans-serif;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 8px;
    background: rgba(110, 231, 183, 0.08);
    border: 1px solid rgba(110, 231, 183, 0.25);
    font-size: 12px;
    line-height: 1.2;
  }
  .chip.kind-env {
    background: rgba(252, 211, 77, 0.08);
    border-color: rgba(252, 211, 77, 0.25);
  }
  .chip.kind-attr {
    background: rgba(96, 165, 250, 0.08);
    border-color: rgba(96, 165, 250, 0.25);
  }
  .chip.kind-other {
    background: rgba(255, 255, 255, 0.05);
    border-color: #3a4150;
  }
  code {
    font-family: ui-monospace, "JetBrains Mono", Menlo, monospace;
    font-size: 11px;
    letter-spacing: 0;
  }
  .lhs {
    color: #e6e8ee;
  }
  .kind-env .lhs    { color: #fcd34d; }
  .kind-attr .lhs   { color: #93c5fd; }
  .eq {
    color: #5b637a;
    font-size: 11px;
    font-family: ui-monospace, monospace;
  }
  .rhs {
    color: #6ee7b7;
  }
  .kind-env .rhs    { color: #fcd34d; }
  .kind-attr .rhs   { color: #93c5fd; }
  .op {
    font-weight: 700;
    font-size: 9px;
    letter-spacing: 0.12em;
    padding: 3px 8px;
    border-radius: 6px;
    background: rgba(252, 211, 77, 0.12);
    color: #fcd34d;
    font-family: -apple-system, system-ui, sans-serif;
  }
  .empty {
    color: #5b637a;
    font-style: italic;
    font-size: 12px;
  }
</style>
