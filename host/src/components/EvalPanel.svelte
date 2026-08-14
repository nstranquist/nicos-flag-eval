<script lang="ts">
  import FlagBadge from "./FlagBadge.svelte";
  import ResolutionChain from "./ResolutionChain.svelte";
  import { formatValue } from "../lib/format";
  import { evaluate, type FlagSpec, type EvalResult } from "../lib/api";

  interface Props {
    flag: FlagSpec;
  }
  let { flag }: Props = $props();

  let userId = $state("");
  let env = $state("");
  let project = $state("");
  let attrs = $state("");
  let result: EvalResult | null = $state(null);
  let evaluating = $state(false);
  let err = $state("");

  let attrsRecord = $derived.by(() => {
    const out: Record<string, string> = {};
    for (const pair of attrs.split(",")) {
      const p = pair.trim();
      if (!p) continue;
      const i = p.indexOf("=");
      if (i < 0) continue;
      out[p.slice(0, i)] = p.slice(i + 1);
    }
    return out;
  });

  async function run() {
    evaluating = true;
    err = "";
    result = null;
    try {
      result = await evaluate(flag.key, {
        userId: userId || undefined,
        env: env || undefined,
        project: project || undefined,
        attrs: Object.keys(attrsRecord).length ? attrsRecord : undefined,
      });
    } catch (e) {
      err = String(e);
    } finally {
      evaluating = false;
    }
  }

  // Auto-evaluate on mount + when context changes (debounced).
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    void flag.key; void userId; void env; void project; void attrs;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(run, 200);
    return () => { if (debounceTimer) clearTimeout(debounceTimer); };
  });
</script>

<div class="panel">
  <div class="head">
    <h3>Live evaluator</h3>
    <span class="sub">eval against the bundled manifest</span>
  </div>

  <div class="ctx">
    <label>
      <span>user_id</span>
      <input bind:value={userId} placeholder="alice" autocomplete="off" />
    </label>
    <label>
      <span>env</span>
      <input bind:value={env} placeholder="iat / staging / prod" autocomplete="off" />
    </label>
    <label>
      <span>project</span>
      <input bind:value={project} placeholder="optional" autocomplete="off" />
    </label>
    <label class="wide">
      <span>attrs (k=v,k2=v2)</span>
      <input bind:value={attrs} placeholder="is_internal=true" autocomplete="off" />
    </label>
  </div>

  <div class="result" class:loading={evaluating}>
    {#if err}
      <div class="err">{err}</div>
    {:else if !result}
      <div class="hint">…</div>
    {:else}
      <div class="result-grid">
        <div class="value">
          <span class="value-label">Value</span>
          <code>{formatValue(result.value)}</code>
        </div>
        <div class="source">
          <span class="value-label">Source</span>
          <FlagBadge source={result.source} />
        </div>
        {#if result.variant}
          <div class="variant">
            <span class="value-label">Variant</span>
            <code>{result.variant}</code>
          </div>
        {/if}
        {#if result.rule}
          <div class="rule-num">
            <span class="value-label">Rule</span>
            <code>#{result.rule}</code>
          </div>
        {/if}
      </div>
      <div class="reason">{result.reason}</div>
      <ResolutionChain source={result.source} />
    {/if}
  </div>
</div>

<style>
  .panel {
    background: #161922;
    border: 1px solid #2a2f3c;
    border-radius: 14px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .head {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .head h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #fcd34d;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .head .sub {
    color: #8a92a6;
    font-size: 12px;
  }
  .ctx {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 10px;
  }
  .ctx label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 11px;
    color: #8a92a6;
  }
  .ctx label.wide {
    grid-column: span 3;
  }
  input {
    background: #0a0d12;
    border: 1px solid #2a2f3c;
    border-radius: 8px;
    padding: 8px 10px;
    color: #e6e8ee;
    font-family: ui-monospace, "JetBrains Mono", Menlo, monospace;
    font-size: 13px;
    transition: border-color 0.12s ease, box-shadow 0.12s ease;
  }
  input:focus {
    outline: none;
    border-color: #6ee7b7;
    box-shadow: 0 0 0 3px rgba(110, 231, 183, 0.12);
  }
  .result {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 100px;
    transition: opacity 0.18s ease;
  }
  .result.loading {
    opacity: 0.5;
  }
  .result-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr;
    gap: 16px;
  }
  .value-label {
    display: block;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #5b637a;
    margin-bottom: 4px;
  }
  code {
    font-family: ui-monospace, "JetBrains Mono", Menlo, monospace;
    font-size: 14px;
    color: #6ee7b7;
  }
  .reason {
    color: #8a92a6;
    font-size: 12px;
    font-style: italic;
  }
  .err {
    color: #f87171;
    background: rgba(248, 113, 113, 0.08);
    border: 1px solid rgba(248, 113, 113, 0.3);
    border-radius: 8px;
    padding: 10px 12px;
    font-family: ui-monospace, monospace;
    font-size: 12px;
  }
  .hint {
    color: #5b637a;
  }
</style>
