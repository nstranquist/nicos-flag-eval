<script lang="ts" module>
  // Wire shape — matches the actual rules[i] stored in flags.runtime.json
  // as of 2026-05-19. Today's manifest uses only `if` + `rollout` + `value`
  // + `description`, but the field set is loose so the resolver can evolve.
  import type { Condition } from "./ConditionDisplay.svelte";

  export interface RuleSpec {
    /** Structured condition evaluated against the eval context. */
    if?: Condition;
    /** Percentage rollout hashed by `by` (e.g. "user_id"). */
    rollout?: { seed: string; percentage: number; by: string };
    /** Optional namespace window — rollout applies only within [a, b). */
    namespaceRange?: [number, number];
    /** Resolved value when this rule wins. */
    value?: unknown;
    /** Optional description shown in the card header. */
    description?: string;
  }
</script>

<script lang="ts">
  import ConditionDisplay from "./ConditionDisplay.svelte";
  import RolloutBar from "./RolloutBar.svelte";
  import { formatValue } from "../lib/format";

  interface Props {
    index: number;
    rule: RuleSpec;
    /** Set when this rule is the one that resolved at the current eval context. */
    hit?: boolean;
    /** Optional bucket cursor for the user — passed to RolloutBar so the
     *  reader sees whether THEY land in the on-share. */
    bucketCursor?: number;
  }
  let { index, rule, hit = false, bucketCursor }: Props = $props();

  let kind = $derived.by(() => {
    if (rule.rollout && rule.if) return "gated-rollout";
    if (rule.rollout) return "rollout";
    if (rule.if) return "condition";
    return "force";
  });
</script>

<article class="rule" class:hit data-kind={kind}>
  <header>
    <span class="idx">#{index + 1}</span>
    <span class="kind kind-{kind}">{kind}</span>
    {#if rule.description}
      <span class="desc">{rule.description}</span>
    {/if}
    {#if hit}
      <span class="hit-pill" title="this rule resolved the current eval">← HIT</span>
    {/if}
    {#if rule.value !== undefined}
      <span class="sets">
        <span class="sets-label">sets</span>
        <code class="value">{formatValue(rule.value)}</code>
      </span>
    {/if}
  </header>

  <div class="body">
    {#if rule.if}
      <div class="row">
        <span class="row-label">when</span>
        <ConditionDisplay condition={rule.if} />
      </div>
    {/if}

    {#if rule.rollout}
      <div class="row">
        <span class="row-label">rollout</span>
        <div class="rollout-wrap">
          <RolloutBar
            percentage={rule.rollout.percentage}
            hashKey={rule.rollout.by}
            namespaceRange={rule.namespaceRange}
            {bucketCursor}
          />
          {#if rule.rollout.seed}
            <div class="seed">seed <code>{rule.rollout.seed}</code></div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</article>

<style>
  .rule {
    background: #0a0d12;
    border: 1px solid #2a2f3c;
    border-radius: 12px;
    padding: 14px 16px;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .rule:hover {
    border-color: #3a4150;
  }
  .rule.hit {
    border-color: rgba(110, 231, 183, 0.5);
    box-shadow: 0 0 0 1px rgba(110, 231, 183, 0.15), 0 6px 20px -8px rgba(110, 231, 183, 0.2);
    background: linear-gradient(180deg, rgba(110, 231, 183, 0.04), transparent);
  }
  header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }
  .idx {
    font-family: ui-monospace, "JetBrains Mono", Menlo, monospace;
    font-size: 11px;
    color: #5b637a;
    background: #161922;
    border: 1px solid #2a2f3c;
    padding: 2px 8px;
    border-radius: 6px;
    font-weight: 600;
  }
  .kind {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 3px 8px;
    border-radius: 999px;
    font-family: -apple-system, system-ui, sans-serif;
  }
  .kind-rollout {
    background: rgba(110, 231, 183, 0.12);
    color: #6ee7b7;
  }
  .kind-condition {
    background: rgba(252, 211, 77, 0.12);
    color: #fcd34d;
  }
  .kind-gated-rollout {
    background: rgba(196, 181, 253, 0.14);
    color: #c4b5fd;
  }
  .kind-force {
    background: rgba(251, 146, 60, 0.14);
    color: #fdba74;
  }
  .desc {
    color: #8a92a6;
    font-size: 12px;
    font-style: italic;
  }
  .hit-pill {
    background: #6ee7b7;
    color: #0a0c10;
    font-size: 9px;
    font-weight: 800;
    padding: 2px 8px;
    border-radius: 4px;
    letter-spacing: 0.1em;
    font-family: -apple-system, system-ui, sans-serif;
  }
  .sets {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
  }
  .sets-label {
    color: #5b637a;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .value {
    color: #fcd34d;
    font-family: ui-monospace, monospace;
    font-size: 12px;
    font-weight: 600;
    background: rgba(252, 211, 77, 0.08);
    padding: 2px 8px;
    border-radius: 4px;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }
  .row-label {
    flex-shrink: 0;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #5b637a;
    width: 64px;
    padding-top: 6px;
    font-family: -apple-system, system-ui, sans-serif;
  }
  .rollout-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .seed {
    font-size: 10px;
    color: #5b637a;
    font-family: ui-monospace, monospace;
  }
  .seed code {
    color: #8a92a6;
  }
</style>
