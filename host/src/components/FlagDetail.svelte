<script lang="ts">
  import EvalPanel from "./EvalPanel.svelte";
  import OverrideEditor from "./OverrideEditor.svelte";
  import AuditTimeline from "./AuditTimeline.svelte";
  import EnvMatrix from "./EnvMatrix.svelte";
  import ForceList from "./ForceList.svelte";
  import RuleCard, { type RuleSpec } from "./RuleCard.svelte";
  import { formatValue } from "../lib/format";
  import type { AuditEvent, EvalResult, FlagSpec } from "../lib/api";

  interface Props {
    flag: FlagSpec;
    currentOverride: unknown | undefined;
    overrideMeta: { actor: string; reason: string | null; updated_at: string } | null;
    envName: string;
    refreshToken: number;
    onclose: () => void;
    onchange: () => void;
    previewResult?: EvalResult | null;
    previewEvents?: AuditEvent[];
    previewEnvResults?: Record<string, EvalResult>;
    skipRemote?: boolean;
  }
  let {
    flag, currentOverride, overrideMeta, envName, refreshToken, onclose, onchange,
    previewResult = null, previewEvents, previewEnvResults, skipRemote = false,
  }: Props = $props();

  let tab: "manage" | "rules" | "raw" = $state("manage");
</script>

<aside class="drawer" tabindex="-1">
  <div class="head">
    <div class="head-info">
      <div class="key-row">
        <code class="key">{flag.key}</code>
        <span class="type-pill" data-type={flag.type}>{flag.type}</span>
        <span class="scope-pill" data-scope={flag.scope}>{flag.scope}</span>
      </div>
      {#if flag.description}<p class="desc">{flag.description}</p>{/if}
      <div class="meta-row">
        {#if flag.owner}<span><strong>owner</strong> {flag.owner}</span>{/if}
        {#if flag.envVar}<span><strong>envVar</strong> <code>{flag.envVar}</code></span>{/if}
        {#if flag.hashVersion}<span><strong>hashV</strong> <code>{flag.hashVersion}</code></span>{/if}
        {#if flag.stickyBucketing}<span class="badge-on">sticky</span>{/if}
        {#if flag.namespace}<span><strong>ns</strong> <code>{flag.namespace}</code> [{flag.namespaceRange?.[0]}, {flag.namespaceRange?.[1]})</span>{/if}
        {#if flag.killDate}<span><strong>killDate</strong> <code>{flag.killDate}</code></span>{/if}
      </div>
    </div>
    <button class="close" onclick={onclose} aria-label="close">×</button>
  </div>

  <nav class="tabs">
    <button class:active={tab === "manage"} onclick={() => (tab = "manage")}>Manage</button>
    <button class:active={tab === "rules"} onclick={() => (tab = "rules")}>Rules ({flag.rules?.length ?? 0})</button>
    <button class:active={tab === "raw"} onclick={() => (tab = "raw")}>Raw JSON</button>
  </nav>

  <div class="body">
    {#if tab === "manage"}
      <OverrideEditor
        {flag}
        {currentOverride}
        {overrideMeta}
        {envName}
        {onchange}
        {skipRemote}
      />

      <EvalPanel {flag} {previewResult} {skipRemote} />

      <AuditTimeline flagKey={flag.key} {refreshToken} events={previewEvents} />

      <section class="card">
        <h3>Manifest default</h3>
        <code class="block">{formatValue(flag.default)}</code>
      </section>

      {#if flag.tags?.length}
        <section class="card">
          <h3>Tags</h3>
          <div class="tags">
            {#each flag.tags as tag (tag)}
              <span class="tag">{tag}</span>
            {/each}
          </div>
        </section>
      {/if}

      {#if (flag.force_include && Object.keys(flag.force_include).length) || (flag.force_exclude && flag.force_exclude.length)}
        <div class="force-stack">
          {#if flag.force_include && Object.keys(flag.force_include).length}
            <ForceList kind="include" items={flag.force_include} />
          {/if}
          {#if flag.force_exclude && flag.force_exclude.length}
            <ForceList kind="exclude" items={flag.force_exclude} />
          {/if}
        </div>
      {/if}

      <EnvMatrix flagKey={flag.key} {skipRemote} previewResults={previewEnvResults} />
    {:else if tab === "rules"}
      {#if !flag.rules?.length}
        <p class="empty">No rules — falls through to manifest default.</p>
      {:else}
        <div class="rule-stack">
          {#each flag.rules as rule, i (i)}
            <RuleCard index={i} rule={rule as RuleSpec} />
          {/each}
        </div>
      {/if}
    {:else}
      <pre class="raw">{JSON.stringify(flag, null, 2)}</pre>
    {/if}
  </div>
</aside>

<style>
  .drawer {
    background: #0f1115;
    border-left: 1px solid #2a2f3c;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
  }
  .head {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 16px;
    padding: 20px 24px 16px;
    border-bottom: 1px solid #2a2f3c;
  }
  .key-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .key {
    font-family: ui-monospace, "JetBrains Mono", Menlo, monospace;
    font-size: 17px;
    font-weight: 600;
    color: #e6e8ee;
  }
  .type-pill, .scope-pill {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    font-family: ui-monospace, monospace;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border: 1px solid;
  }
  .type-pill[data-type="boolean"] { color: #6ee7b7; border-color: rgba(110,231,183,0.4); background: rgba(110,231,183,0.08); }
  .type-pill[data-type="string"]  { color: #fcd34d; border-color: rgba(252,211,77,0.4); background: rgba(252,211,77,0.08); }
  .type-pill[data-type="number"]  { color: #93c5fd; border-color: rgba(147,197,253,0.4); background: rgba(147,197,253,0.08); }
  .type-pill[data-type="json"]    { color: #c4b5fd; border-color: rgba(196,181,253,0.4); background: rgba(196,181,253,0.08); }
  .scope-pill {
    color: #8a92a6;
    border-color: #2a2f3c;
    background: rgba(255,255,255,0.02);
  }
  .desc {
    margin: 8px 0 0;
    color: #8a92a6;
    font-size: 13px;
    line-height: 1.5;
  }
  .meta-row {
    margin-top: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    font-size: 11px;
    color: #5b637a;
  }
  .meta-row strong {
    color: #8a92a6;
    font-weight: 500;
    margin-right: 4px;
  }
  .badge-on {
    color: #c4b5fd;
    background: rgba(168, 85, 247, 0.14);
    border: 1px solid rgba(168, 85, 247, 0.4);
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
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
    transition: background 0.12s ease, color 0.12s ease;
  }
  .close:hover {
    background: rgba(255,255,255,0.05);
    color: #e6e8ee;
  }
  .tabs {
    display: flex;
    gap: 4px;
    padding: 8px 24px;
    border-bottom: 1px solid #2a2f3c;
    background: #0a0d12;
  }
  .tabs button {
    background: transparent;
    border: 0;
    color: #5b637a;
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition: background 0.12s ease, color 0.12s ease;
  }
  .tabs button:hover {
    color: #e6e8ee;
  }
  .tabs button.active {
    background: rgba(110, 231, 183, 0.1);
    color: #6ee7b7;
  }
  .body {
    flex: 1;
    overflow-y: auto;
    padding: 20px 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .card {
    background: #161922;
    border: 1px solid #2a2f3c;
    border-radius: 12px;
    padding: 16px 20px;
  }
  .card h3 {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #fcd34d;
    margin: 0 0 10px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .force-stack, .rule-stack {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .block {
    display: block;
    background: #0a0d12;
    padding: 10px 12px;
    border-radius: 8px;
    font-family: ui-monospace, monospace;
    font-size: 13px;
    color: #6ee7b7;
    overflow-x: auto;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .tag {
    background: rgba(255,255,255,0.05);
    border: 1px solid #2a2f3c;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    color: #8a92a6;
  }
  .empty {
    color: #5b637a;
    font-style: italic;
  }
  .raw {
    background: #0a0d12;
    padding: 16px;
    border-radius: 10px;
    border: 1px solid #2a2f3c;
    font-family: ui-monospace, monospace;
    font-size: 12px;
    color: #e6e8ee;
    overflow: auto;
  }
</style>
