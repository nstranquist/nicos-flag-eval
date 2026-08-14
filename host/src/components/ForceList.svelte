<script lang="ts">
  // Chip list for force_include / force_exclude. Prop-driven items —
  // parent decides whether they come from manifest, Turso force overrides,
  // or a merge of both. Optional onadd/onremove handlers light up the
  // inline "+ user" input + per-chip × button.

  type IncludeMap = Record<string, unknown>;

  interface Props {
    kind: "include" | "exclude";
    /** include: Record<userId, value>. exclude: string[] of userIds. */
    items: IncludeMap | string[];
    /** Optional remove handler — chip gets an × button when wired. */
    onremove?: (id: string) => void;
    /** Optional add handler — inline "+ user" input appears when wired.
     *  For include kind, second arg is the parsed value (default true).
     *  For exclude kind, value is always true (presence-only marker). */
    onadd?: (id: string, value?: unknown) => void;
    /** Optional override of the placeholder copy. */
    placeholder?: string;
  }
  let { kind, items, onremove, onadd, placeholder }: Props = $props();

  let entries = $derived.by((): Array<{ id: string; value: unknown }> => {
    if (Array.isArray(items)) {
      return items.map((id) => ({ id, value: undefined }));
    }
    return Object.entries(items ?? {}).map(([id, value]) => ({ id, value }));
  });

  let isInclude = $derived(kind === "include");

  // Inline add state.
  let newId = $state("");
  let newValue = $state("");
  let addErr = $state("");
  let adding = $state(false);

  function tryParseValue(raw: string): unknown {
    const t = raw.trim();
    if (t === "") return true;
    if (t === "true") return true;
    if (t === "false") return false;
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
    try { return JSON.parse(t); } catch { return t; }
  }

  function handleAdd() {
    const id = newId.trim();
    if (!id) {
      addErr = "id required";
      return;
    }
    if (isInclude ? id in (items as IncludeMap) : (items as string[]).includes(id)) {
      addErr = "already present";
      return;
    }
    const value = isInclude ? tryParseValue(newValue) : true;
    addErr = "";
    adding = true;
    try {
      onadd?.(id, value);
    } finally {
      adding = false;
      newId = "";
      newValue = "";
    }
  }

  function handleKey(ev: KeyboardEvent) {
    if (ev.key === "Enter") {
      ev.preventDefault();
      handleAdd();
    }
  }
</script>

<section class="force" class:include={isInclude} class:exclude={!isInclude}>
  <header>
    <div class="head-left">
      <span class="kind-pill">{kind === "include" ? "force-include" : "force-exclude"}</span>
      <span class="count">{entries.length}</span>
    </div>
    <span class="help">
      {kind === "include" ? "wins over every rule below the rule tier" : "skipped before any rule eval"}
    </span>
  </header>

  {#if entries.length === 0 && !onadd}
    <div class="empty">No pinned users.</div>
  {:else}
    <div class="chips">
      {#each entries as e (e.id)}
        <span class="chip">
          <span class="dot"></span>
          <code class="id">{e.id}</code>
          {#if isInclude && e.value !== undefined}
            <span class="arrow">→</span>
            <code class="value">{typeof e.value === "string" ? e.value : JSON.stringify(e.value)}</code>
          {/if}
          {#if onremove}
            <button class="remove" onclick={() => onremove?.(e.id)} aria-label={`remove ${e.id}`}>×</button>
          {/if}
        </span>
      {/each}

      {#if onadd}
        <span class="chip add" class:error={addErr}>
          <span class="plus">+</span>
          <input
            class="add-id"
            type="text"
            bind:value={newId}
            placeholder={placeholder ?? (isInclude ? "user id" : "user id to exclude")}
            onkeydown={handleKey}
            autocomplete="off"
            aria-label="new id"
          />
          {#if isInclude}
            <span class="arrow">→</span>
            <input
              class="add-val"
              type="text"
              bind:value={newValue}
              placeholder="value (default true)"
              onkeydown={handleKey}
              autocomplete="off"
              aria-label="new value"
            />
          {/if}
          <button class="add-btn" onclick={handleAdd} disabled={adding} aria-label="add">↵</button>
        </span>
      {/if}
    </div>
    {#if addErr}<div class="err">{addErr}</div>{/if}
  {/if}
</section>

<style>
  .force {
    background: #0a0d12;
    border: 1px solid #2a2f3c;
    border-radius: 12px;
    padding: 14px 16px;
    font-family: -apple-system, "Inter", system-ui, sans-serif;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
    gap: 10px;
  }
  .head-left {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .kind-pill {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 3px 8px;
    border-radius: 999px;
    background: rgba(96, 165, 250, 0.14);
    color: #93c5fd;
    font-family: -apple-system, system-ui, sans-serif;
  }
  .exclude .kind-pill {
    background: rgba(248, 113, 113, 0.14);
    color: #fca5a5;
  }
  .count {
    color: #e6e8ee;
    font-weight: 600;
    font-size: 13px;
    font-family: ui-monospace, monospace;
  }
  .help {
    color: #5b637a;
    font-size: 11px;
    font-style: italic;
  }
  .empty {
    color: #5b637a;
    font-style: italic;
    font-size: 12px;
    padding: 4px 0;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 8px;
    background: rgba(96, 165, 250, 0.08);
    border: 1px solid rgba(96, 165, 250, 0.3);
    transition: background 0.12s ease, border-color 0.12s ease;
  }
  .exclude .chip {
    background: rgba(248, 113, 113, 0.06);
    border-color: rgba(248, 113, 113, 0.3);
  }
  .chip:hover {
    background: rgba(96, 165, 250, 0.14);
  }
  .exclude .chip:hover {
    background: rgba(248, 113, 113, 0.12);
  }
  .dot {
    width: 5px;
    height: 5px;
    border-radius: 999px;
    background: #93c5fd;
    box-shadow: 0 0 4px rgba(96, 165, 250, 0.6);
  }
  .exclude .dot {
    background: #fca5a5;
    box-shadow: 0 0 4px rgba(248, 113, 113, 0.6);
  }
  .id {
    font-family: ui-monospace, "JetBrains Mono", Menlo, monospace;
    font-size: 11px;
    color: #e6e8ee;
  }
  .arrow {
    color: #5b637a;
    font-family: ui-monospace, monospace;
  }
  .value {
    font-family: ui-monospace, monospace;
    font-size: 11px;
    color: #fcd34d;
  }
  .remove {
    background: transparent;
    border: 0;
    color: #5b637a;
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    padding: 0 2px;
    margin-left: 4px;
    border-radius: 4px;
    transition: color 0.12s ease, background 0.12s ease;
  }
  .remove:hover {
    color: #fca5a5;
    background: rgba(248, 113, 113, 0.15);
  }
  .chip.add {
    background: transparent;
    border-color: #2a2f3c;
    border-style: dashed;
    padding: 2px 8px 2px 10px;
  }
  .chip.add.error {
    border-color: rgba(248, 113, 113, 0.5);
  }
  .plus {
    color: #5b637a;
    font-family: ui-monospace, monospace;
    font-weight: 700;
  }
  .add-id, .add-val {
    background: transparent;
    border: 0;
    color: #e6e8ee;
    font-family: ui-monospace, "JetBrains Mono", Menlo, monospace;
    font-size: 11px;
    padding: 2px 0;
    width: 130px;
    outline: none;
  }
  .add-val { width: 90px; color: #fcd34d; }
  .add-id::placeholder, .add-val::placeholder {
    color: #3a4150;
  }
  .add-btn {
    background: transparent;
    border: 0;
    color: #6ee7b7;
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    padding: 0 4px;
    border-radius: 4px;
    transition: background 0.12s ease;
  }
  .add-btn:hover {
    background: rgba(110, 231, 183, 0.12);
  }
  .add-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .err {
    margin-top: 6px;
    color: #fca5a5;
    font-size: 11px;
    font-family: ui-monospace, monospace;
  }
</style>
