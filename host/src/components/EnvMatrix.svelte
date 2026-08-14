<script lang="ts">
  import { evaluate, type EvalResult } from "../lib/api";
  import { sourceColor, formatValue } from "../lib/format";

  // Cross-environment resolved-value matrix. Fans out /api/evaluate over
  // a set of envs in parallel and renders each as a colored cell. The
  // cell color is the source-of-resolution palette (green=rule,
  // yellow=override, gray=default, etc.) so a developer can answer
  // "what does flag X look like across our envs right now" without env-
  // toggling the App.svelte switcher five times.

  interface Props {
    flagKey: string;
    envs?: string[];
    /** Optional user-id context applied to every eval (lets us preview
     *  per-user resolution across envs without re-typing). */
    userId?: string;
  }
  let { flagKey, envs = ["default", "dev", "staging", "iat", "prod"], userId }: Props = $props();

  let results: Record<string, EvalResult | { error: string }> = $state({});
  let loading = $state(true);
  let refreshKey = $state(0);

  async function loadAll() {
    loading = true;
    results = {};
    await Promise.all(
      envs.map(async (env) => {
        try {
          const r = await evaluate(flagKey, { env, userId: userId || undefined });
          results = { ...results, [env]: r };
        } catch (e) {
          results = { ...results, [env]: { error: String(e) } };
        }
      }),
    );
    loading = false;
  }

  $effect(() => {
    void flagKey; void userId; void refreshKey;
    loadAll();
  });

  function isError(r: unknown): r is { error: string } {
    return !!r && typeof r === "object" && "error" in (r as object);
  }
</script>

<section class="matrix">
  <header>
    <div>
      <h3>Environment matrix</h3>
      <span class="sub">live resolution across {envs.length} envs · <code>{flagKey}</code></span>
    </div>
    <button class="refresh" onclick={() => (refreshKey += 1)} aria-label="refresh">↻</button>
  </header>

  <div class="grid" class:loading style:--cols={envs.length}>
    {#each envs as env (env)}
      {@const r = results[env]}
      {@const err = isError(r) ? r.error : null}
      {@const c = !err && r ? sourceColor(r.source) : null}
      <div class="cell" class:err style:--ring={c?.ring ?? "#3a4150"} style:--bg={c?.bg ?? "transparent"} style:--fg={c?.fg ?? "#5b637a"}>
        <div class="env-name">{env}</div>
        {#if !r}
          <div class="placeholder">…</div>
        {:else if err}
          <div class="placeholder err-text" title={err}>error</div>
          <div class="source">network</div>
        {:else}
          <div class="value">{formatValue(r.value)}</div>
          <div class="source">{r.source}</div>
          {#if r.rule !== undefined}
            <div class="rule-num">rule #{r.rule + 1}</div>
          {/if}
        {/if}
      </div>
    {/each}
  </div>
</section>

<style>
  .matrix {
    background: #161922;
    border: 1px solid #2a2f3c;
    border-radius: 12px;
    padding: 16px 20px;
    font-family: -apple-system, "Inter", system-ui, sans-serif;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 14px;
  }
  h3 {
    margin: 0 0 4px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #fcd34d;
  }
  .sub {
    color: #8a92a6;
    font-size: 11px;
  }
  .sub code {
    color: #6ee7b7;
    font-family: ui-monospace, monospace;
    font-size: 11px;
  }
  .refresh {
    background: transparent;
    border: 1px solid #2a2f3c;
    color: #8a92a6;
    border-radius: 6px;
    width: 28px;
    height: 28px;
    cursor: pointer;
    font-size: 14px;
    transition: border-color 0.12s ease, color 0.12s ease, transform 0.3s ease;
  }
  .refresh:hover {
    border-color: #fcd34d;
    color: #fcd34d;
    transform: rotate(180deg);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
    gap: 8px;
    transition: opacity 0.18s ease;
  }
  .grid.loading {
    opacity: 0.5;
  }
  .cell {
    background: var(--bg);
    border: 1px solid var(--ring);
    border-radius: 10px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 92px;
    position: relative;
  }
  .env-name {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #8a92a6;
    font-weight: 600;
  }
  .value {
    font-family: ui-monospace, "JetBrains Mono", Menlo, monospace;
    font-size: 15px;
    font-weight: 600;
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.4;
  }
  .source {
    font-size: 10px;
    color: var(--fg);
    opacity: 0.7;
    margin-top: auto;
    font-family: ui-monospace, monospace;
  }
  .rule-num {
    font-size: 9px;
    color: #5b637a;
    font-family: ui-monospace, monospace;
  }
  .placeholder {
    color: #5b637a;
    font-style: italic;
    font-size: 13px;
  }
  .err .value, .err .source {
    color: #fca5a5;
  }
  .err-text {
    color: #fca5a5;
  }
</style>
