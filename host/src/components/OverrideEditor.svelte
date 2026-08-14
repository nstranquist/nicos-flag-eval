<script lang="ts">
  import {
    setOverride, clearOverride,
    fetchForceLists, setForceEntry, clearForceEntry,
    type FlagSpec, type ForceScope,
  } from "../lib/api";
  import { formatValue } from "../lib/format";
  import ForceList from "./ForceList.svelte";

  interface Props {
    flag: FlagSpec;
    currentOverride: unknown | undefined;
    overrideMeta: { actor: string; reason: string | null; updated_at: string } | null;
    envName: string;
    onchange: () => void;
  }
  let { flag, currentOverride, overrideMeta, envName, onchange }: Props = $props();

  // Force-override state — Turso-backed per-(env, flag, user) pinning.
  // Separate from the manifest's static force_include/exclude blocks.
  let forceInclude: Record<string, unknown> = $state({});
  let forceExclude: string[] = $state([]);
  let forceLoading = $state(false);
  let forceErr = $state("");

  async function loadForceLists() {
    forceLoading = true;
    forceErr = "";
    try {
      const r = await fetchForceLists(flag.key, envName);
      forceInclude = r.include ?? {};
      forceExclude = r.exclude ?? [];
    } catch (e) {
      forceErr = String(e);
    } finally {
      forceLoading = false;
    }
  }

  $effect(() => {
    void flag.key; void envName;
    loadForceLists();
  });

  async function handleAddForce(scope: ForceScope, userId: string, value: unknown) {
    try {
      const r = await setForceEntry(flag.key, userId, value, { env: envName, scope, reason: "force-list add" });
      if (!r.ok) { forceErr = r.error ?? "unknown error"; return; }
      await loadForceLists();
      onchange();
    } catch (e) {
      forceErr = String(e);
    }
  }

  async function handleRemoveForce(scope: ForceScope, userId: string) {
    if (!confirm(`Remove ${userId} from ${scope} for env ${envName}?`)) return;
    try {
      const r = await clearForceEntry(flag.key, userId, { env: envName, scope });
      if (!r.ok) { forceErr = r.error ?? "unknown error"; return; }
      await loadForceLists();
      onchange();
    } catch (e) {
      forceErr = String(e);
    }
  }

  let editing = $state(false);
  let editVal = $state("");
  let editReason = $state("");
  let saving = $state(false);
  let err = $state("");

  let hasOverride = $derived(currentOverride !== undefined);

  function startEdit() {
    err = "";
    editVal = hasOverride
      ? typeof currentOverride === "string"
        ? (currentOverride as string)
        : JSON.stringify(currentOverride)
      : flag.type === "boolean"
      ? String(flag.default)
      : flag.type === "string"
      ? String(flag.default)
      : JSON.stringify(flag.default);
    editReason = "";
    editing = true;
  }

  function cancel() {
    editing = false;
    err = "";
  }

  function parseInput(): { ok: true; value: unknown } | { ok: false; error: string } {
    const raw = editVal.trim();
    switch (flag.type) {
      case "boolean": {
        if (raw === "true") return { ok: true, value: true };
        if (raw === "false") return { ok: true, value: false };
        return { ok: false, error: "boolean must be `true` or `false`" };
      }
      case "string":
        return { ok: true, value: raw };
      case "number": {
        const n = Number(raw);
        if (Number.isNaN(n)) return { ok: false, error: "not a number" };
        return { ok: true, value: n };
      }
      case "json": {
        try { return { ok: true, value: JSON.parse(raw) }; }
        catch (e) { return { ok: false, error: `invalid JSON: ${e}` }; }
      }
    }
    return { ok: false, error: "unknown type" };
  }

  async function save() {
    const parsed = parseInput();
    if (!parsed.ok) {
      err = parsed.error;
      return;
    }
    saving = true;
    err = "";
    try {
      const r = await setOverride(flag.key, parsed.value, {
        env: envName,
        reason: editReason || undefined,
      });
      if (!r.ok) {
        err = r.error ?? "unknown error";
        saving = false;
        return;
      }
      editing = false;
      onchange();
    } catch (e) {
      err = String(e);
    } finally {
      saving = false;
    }
  }

  async function clearIt() {
    if (!confirm(`Clear cloud override for ${flag.key}?`)) return;
    saving = true;
    err = "";
    try {
      const r = await clearOverride(flag.key, { env: envName });
      if (!r.ok) err = r.error ?? "unknown error";
      onchange();
    } catch (e) {
      err = String(e);
    } finally {
      saving = false;
    }
  }

  async function quickToggle() {
    if (flag.type !== "boolean") return;
    const cur = hasOverride ? currentOverride : flag.default;
    saving = true;
    err = "";
    try {
      const r = await setOverride(flag.key, !cur, { env: envName, reason: "quick toggle" });
      if (!r.ok) err = r.error ?? "unknown error";
      onchange();
    } catch (e) {
      err = String(e);
    } finally {
      saving = false;
    }
  }
</script>

<section class="editor" class:has-override={hasOverride}>
  <header>
    <h3>Override · env <code>{envName}</code></h3>
    {#if hasOverride}
      <span class="badge">active</span>
    {:else}
      <span class="badge-off">inherits default</span>
    {/if}
  </header>

  {#if hasOverride && !editing}
    <div class="state">
      <div class="state-row">
        <span class="state-label">Value</span>
        <code class="value">{formatValue(currentOverride)}</code>
      </div>
      {#if overrideMeta}
        <div class="state-row sub">
          <span class="state-label">Set by</span>
          <span>{overrideMeta.actor}</span>
        </div>
        {#if overrideMeta.reason}
          <div class="state-row sub">
            <span class="state-label">Reason</span>
            <span class="reason">"{overrideMeta.reason}"</span>
          </div>
        {/if}
        <div class="state-row sub">
          <span class="state-label">Updated</span>
          <span class="ts">{new Date(overrideMeta.updated_at).toLocaleString()}</span>
        </div>
      {/if}
    </div>
  {/if}

  {#if editing}
    <div class="form">
      <label>
        <span>New value ({flag.type})</span>
        {#if flag.type === "boolean"}
          <select bind:value={editVal}>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        {:else if flag.type === "json"}
          <textarea bind:value={editVal} rows="3" autocomplete="off"></textarea>
        {:else}
          <input bind:value={editVal} autocomplete="off" />
        {/if}
      </label>
      <label>
        <span>Reason (audit log)</span>
        <input bind:value={editReason} placeholder="why?" autocomplete="off" />
      </label>
      {#if err}<div class="err">{err}</div>{/if}
      <div class="actions">
        <button class="ghost" onclick={cancel} disabled={saving}>Cancel</button>
        <button class="primary" onclick={save} disabled={saving}>
          {saving ? "Saving…" : "Save override"}
        </button>
      </div>
    </div>
  {:else}
    <div class="actions">
      {#if flag.type === "boolean"}
        <button class="primary" onclick={quickToggle} disabled={saving}>
          {saving ? "…" : hasOverride ? "Toggle" : "Set override"}
        </button>
      {/if}
      <button class="ghost" onclick={startEdit} disabled={saving}>Edit value…</button>
      {#if hasOverride}
        <button class="danger" onclick={clearIt} disabled={saving}>Clear override</button>
      {/if}
    </div>
    {#if err}<div class="err">{err}</div>{/if}
  {/if}

  <div class="force-block">
    <div class="force-head">
      <span class="force-title">Per-user pins · env <code>{envName}</code></span>
      {#if forceLoading}<span class="force-loading">…</span>{/if}
    </div>
    {#if forceErr}<div class="err">{forceErr}</div>{/if}
    <div class="force-stack">
      <ForceList
        kind="include"
        items={forceInclude}
        onadd={(id, val) => handleAddForce("force-include", id, val)}
        onremove={(id) => handleRemoveForce("force-include", id)}
      />
      <ForceList
        kind="exclude"
        items={forceExclude}
        onadd={(id) => handleAddForce("force-exclude", id, true)}
        onremove={(id) => handleRemoveForce("force-exclude", id)}
      />
    </div>
    <p class="force-note">
      Writes persist in Turso as <code>scope=force-include|force-exclude</code>, key <code>{flag.key}:&lt;id&gt;</code>.
      Resolved by <code>/api/evaluate</code> when <code>ctx.userId</code> matches — exclude wins over include (tiers 7 → 8 in the resolution chain).
    </p>
  </div>
</section>

<style>
  .editor {
    background: #161922;
    border: 1px solid #2a2f3c;
    border-radius: 12px;
    padding: 16px 20px;
    transition: border-color 0.15s ease;
  }
  .editor.has-override {
    border-color: rgba(252, 211, 77, 0.4);
    box-shadow: 0 0 0 1px rgba(252, 211, 77, 0.1);
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }
  h3 {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #fcd34d;
  }
  h3 code {
    color: #fcd34d;
    font-family: ui-monospace, monospace;
    text-transform: none;
    letter-spacing: 0;
    margin-left: 4px;
  }
  .badge {
    color: #0a0c10;
    background: #fcd34d;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
  }
  .badge-off {
    color: #8a92a6;
    background: rgba(255,255,255,0.04);
    border: 1px solid #2a2f3c;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .state {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
    padding: 10px 12px;
    background: #0a0c10;
    border-radius: 8px;
    border: 1px solid #1c1f29;
  }
  .state-row {
    display: grid;
    grid-template-columns: 80px 1fr;
    gap: 12px;
    font-size: 13px;
    align-items: center;
  }
  .state-row.sub {
    font-size: 11px;
    color: #8a92a6;
  }
  .state-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #5b637a;
  }
  .value {
    font-family: ui-monospace, monospace;
    color: #fcd34d;
    font-size: 14px;
    font-weight: 500;
  }
  .reason {
    font-style: italic;
  }
  .ts {
    font-family: ui-monospace, monospace;
  }
  .form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .form label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 11px;
    color: #8a92a6;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .form label span {
    color: #8a92a6;
  }
  input, select, textarea {
    background: #0a0c10;
    border: 1px solid #2a2f3c;
    border-radius: 8px;
    padding: 8px 10px;
    color: #e6e8ee;
    font-family: ui-monospace, monospace;
    font-size: 13px;
    text-transform: none;
    letter-spacing: 0;
    transition: border-color 0.12s ease, box-shadow 0.12s ease;
  }
  input:focus, select:focus, textarea:focus {
    outline: none;
    border-color: #fcd34d;
    box-shadow: 0 0 0 3px rgba(252, 211, 77, 0.14);
  }
  textarea {
    font-family: ui-monospace, monospace;
    resize: vertical;
    min-height: 60px;
  }
  .actions {
    display: flex;
    gap: 8px;
    margin-top: 4px;
  }
  button {
    border: 1px solid #2a2f3c;
    border-radius: 8px;
    padding: 7px 14px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease, transform 0.12s ease;
    font-family: inherit;
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  button.primary {
    background: #fcd34d;
    color: #0a0c10;
    border-color: #fcd34d;
  }
  button.primary:not(:disabled):hover {
    background: #fde68a;
    transform: translateY(-1px);
  }
  button.ghost {
    background: transparent;
    color: #e6e8ee;
  }
  button.ghost:not(:disabled):hover {
    background: rgba(255,255,255,0.04);
    border-color: #3a4150;
  }
  button.danger {
    background: transparent;
    color: #fca5a5;
    border-color: rgba(248, 113, 113, 0.4);
  }
  button.danger:not(:disabled):hover {
    background: rgba(248, 113, 113, 0.08);
  }
  .err {
    color: #f87171;
    background: rgba(248, 113, 113, 0.08);
    border: 1px solid rgba(248, 113, 113, 0.3);
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 12px;
    font-family: ui-monospace, monospace;
  }
  .force-block {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px dashed #2a2f3c;
  }
  .force-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }
  .force-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #93c5fd;
  }
  .force-title code {
    color: #93c5fd;
    font-family: ui-monospace, monospace;
    text-transform: none;
    letter-spacing: 0;
    margin-left: 4px;
  }
  .force-loading {
    color: #5b637a;
    font-style: italic;
  }
  .force-stack {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .force-note {
    margin: 10px 0 0;
    color: #5b637a;
    font-size: 11px;
    font-style: italic;
    line-height: 1.5;
  }
  .force-note code {
    font-family: ui-monospace, monospace;
    color: #8a92a6;
  }
</style>
