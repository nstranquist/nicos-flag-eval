<script lang="ts">
  import { onMount } from "svelte";
  import FlagRow from "./components/FlagRow.svelte";
  import FlagDetail from "./components/FlagDetail.svelte";
  import {
    fetchManifest, fetchVersion, fetchOverrides, evaluate,
    setOverride, clearOverride,
  } from "./lib/api";
  import type {
    Manifest, FlagSpec, EvalResult, VersionInfo, OverridesResponse,
  } from "./lib/api";
  import { isOn } from "./lib/format";

  let manifest: Manifest | null = $state(null);
  let version: VersionInfo | null = $state(null);
  let overridesResp: OverridesResponse | null = $state(null);
  let results: Record<string, EvalResult> = $state({});
  let busy: Record<string, boolean> = $state({});
  let loadErr = $state("");

  let query = $state("");
  let scopeFilter: "all" | "cross-project" = $state("all");
  let stateFilter: "all" | "on" | "off" | "overridden" = $state("all");
  let selected: FlagSpec | null = $state(null);
  let envName = $state("default");

  // Bumped after every override write so child views (eval / audit) refresh.
  let refreshToken = $state(0);

  async function loadEverything() {
    try {
      const [m, v, o] = await Promise.all([
        fetchManifest(),
        fetchVersion(),
        fetchOverrides(envName),
      ]);
      manifest = m;
      version = v;
      overridesResp = o;
      for (const f of m.flags) {
        evaluate(f.key, {}).then((r) => {
          results = { ...results, [f.key]: r };
        }).catch(() => {});
      }
    } catch (e) {
      loadErr = String(e);
    }
  }

  onMount(loadEverything);

  $effect(() => {
    void envName; void refreshToken;
    if (!manifest) return;
    fetchOverrides(envName).then((o) => { overridesResp = o; });
    for (const f of manifest.flags) {
      evaluate(f.key, {}).then((r) => {
        results = { ...results, [f.key]: r };
      }).catch(() => {});
    }
  });

  let flags = $derived(manifest?.flags ?? []);

  function hasOverride(key: string): boolean {
    return overridesResp?.overrides[key] !== undefined;
  }

  let filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return flags.filter((f) => {
      if (scopeFilter !== "all" && f.scope !== scopeFilter) return false;
      if (stateFilter !== "all") {
        const r = results[f.key];
        const on = r ? isOn(r.value) : isOn(f.default);
        const ov = hasOverride(f.key);
        if (stateFilter === "on" && !on) return false;
        if (stateFilter === "off" && on) return false;
        if (stateFilter === "overridden" && !ov) return false;
      }
      if (!q) return true;
      return (
        f.key.toLowerCase().includes(q) ||
        (f.description ?? "").toLowerCase().includes(q) ||
        (f.owner ?? "").toLowerCase().includes(q) ||
        (f.tags ?? []).some((t) => t.toLowerCase().includes(q))
      );
    });
  });

  let counts = $derived.by(() => {
    const total = flags.length;
    const on = Object.values(results).filter((r) => r.value === true).length;
    const overrideCount = overridesResp ? Object.keys(overridesResp.overrides).length : 0;
    return { total, on, off: total - on, overrideCount };
  });

  /** Inline toggle from the row. POSTs an override that flips the
   *  current resolved value. Re-pulls overrides + re-evals on success. */
  async function toggle(flag: FlagSpec) {
    if (busy[flag.key]) return;
    const r = results[flag.key];
    const cur = r ? isOn(r.value) : isOn(flag.default);
    busy = { ...busy, [flag.key]: true };
    try {
      await setOverride(flag.key, !cur, {
        env: envName,
        reason: "inline toggle",
      });
    } finally {
      busy = { ...busy, [flag.key]: false };
      refreshToken += 1;
    }
  }

  /** Right-click / shift-click on a toggle: clear the override
   *  instead of flipping. Falls back to the manifest-resolved value. */
  async function clearOverrideKey(flag: FlagSpec) {
    if (busy[flag.key]) return;
    busy = { ...busy, [flag.key]: true };
    try {
      await clearOverride(flag.key, { env: envName });
    } finally {
      busy = { ...busy, [flag.key]: false };
      refreshToken += 1;
    }
  }

  function onOverrideChanged() {
    refreshToken += 1;
  }
</script>

<main>
  <header class="topbar">
    <div class="brand">
      <div class="logo">◆</div>
      <div class="brand-text">
        <h1>flag-eval-demo</h1>
        <span class="tagline">{counts.total} flags · {counts.overrideCount} live overrides · env <code>{envName}</code></span>
      </div>
    </div>
    <div class="topbar-right">
      <div class="env-switch">
        <span>env</span>
        <select bind:value={envName}>
          <option value="default">default</option>
          <option value="dev">dev</option>
          <option value="staging">staging</option>
          <option value="iat">iat</option>
          <option value="prod">prod</option>
        </select>
      </div>
      {#if version}
        <span class="version" title={version.builtAt}>
          <code>{version.manifestSha256.slice(0, 8)}</code>
        </span>
      {/if}
    </div>
  </header>

  {#if loadErr}
    <div class="banner err">
      <strong>Failed to load:</strong> {loadErr}
    </div>
  {/if}

  <div class="workspace" class:with-detail={selected !== null}>
    <section class="list-pane">
      <div class="toolbar">
        <input
          class="search"
          type="search"
          placeholder="search flags…"
          bind:value={query}
          autocomplete="off"
        />
        <div class="filter-tabs" role="tablist" aria-label="state filter">
          <button class:active={stateFilter === "all"} onclick={() => (stateFilter = "all")} title="all flags">
            all<span class="count">{counts.total}</span>
          </button>
          <button class:active={stateFilter === "on"} onclick={() => (stateFilter = "on")} title="resolving true">
            <span class="dot-mini on"></span>on<span class="count">{counts.on}</span>
          </button>
          <button class:active={stateFilter === "off"} onclick={() => (stateFilter = "off")} title="resolving false">
            <span class="dot-mini"></span>off<span class="count">{counts.off}</span>
          </button>
          <button class:active={stateFilter === "overridden"} onclick={() => (stateFilter = "overridden")} title="has a cloud override at this env">
            <span class="dot-mini override"></span>override<span class="count">{counts.overrideCount}</span>
          </button>
        </div>
        <div class="scope-tabs" role="tablist" aria-label="scope filter">
          <button class:active={scopeFilter === "all"} onclick={() => (scopeFilter = "all")}>all</button>
          <button class:active={scopeFilter === "cross-project"} onclick={() => (scopeFilter = "cross-project")}>cross</button>
        </div>
      </div>

      <div class="rows">
        {#if !manifest}
          <div class="loading">Loading manifest…</div>
        {:else if filtered.length === 0}
          <div class="empty">No flags match.</div>
        {:else}
          {#each filtered as f (f.key)}
            <FlagRow
              flag={f}
              result={results[f.key] ?? null}
              selected={selected?.key === f.key}
              busy={!!busy[f.key]}
              hasOverride={hasOverride(f.key)}
              onclick={() => (selected = f)}
              ontoggle={() => toggle(f)}
              oneditvalue={() => (selected = f)}
            />
          {/each}
        {/if}
      </div>

      <div class="footer-hint">
        <span>click a row → manage · click toggle → inline flip · drawer has clear / edit / audit / eval</span>
      </div>
    </section>

    {#if selected}
      {@const meta = overridesResp?.meta?.[selected.key] ?? null}
      <FlagDetail
        flag={selected}
        currentOverride={overridesResp?.overrides[selected.key]}
        overrideMeta={meta}
        {envName}
        {refreshToken}
        onclose={() => (selected = null)}
        onchange={onOverrideChanged}
      />
    {/if}
  </div>
</main>

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    background: #0a0c10;
    color: #e6e8ee;
    font: 13px/1.5 -apple-system, "Inter", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  :global(*) {
    box-sizing: border-box;
  }
  main {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  .topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 24px;
    border-bottom: 1px solid #1c1f29;
    background: rgba(15, 17, 21, 0.7);
    backdrop-filter: blur(8px);
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .logo {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    background: linear-gradient(135deg, #6ee7b7, #34d399);
    color: #0a0c10;
    border-radius: 8px;
    font-size: 15px;
    font-weight: 700;
    box-shadow: 0 3px 12px rgba(110, 231, 183, 0.3);
  }
  .brand h1 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .tagline {
    color: #8a92a6;
    font-size: 11px;
    font-family: ui-monospace, "JetBrains Mono", Menlo, monospace;
  }
  .tagline code {
    color: #fcd34d;
    font-family: inherit;
  }
  .topbar-right {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .env-switch {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #5b637a;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .env-switch select {
    background: #161922;
    border: 1px solid #2a2f3c;
    color: #fcd34d;
    border-radius: 6px;
    padding: 5px 8px;
    font-family: ui-monospace, "JetBrains Mono", Menlo, monospace;
    font-size: 12px;
    cursor: pointer;
  }
  .env-switch select:hover {
    border-color: #fcd34d;
  }
  .version code {
    font-family: ui-monospace, monospace;
    font-size: 11px;
    color: #5b637a;
    background: #161922;
    padding: 4px 8px;
    border-radius: 6px;
    border: 1px solid #1c1f29;
  }
  .banner {
    margin: 12px 24px;
    padding: 12px 16px;
    border-radius: 10px;
    background: rgba(248, 113, 113, 0.08);
    border: 1px solid rgba(248, 113, 113, 0.3);
    color: #fca5a5;
  }
  .workspace {
    flex: 1;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 560px);
    gap: 0;
    padding: 16px 24px 24px;
    align-items: stretch;
    min-height: calc(100vh - 70px);
  }
  .list-pane {
    background: #0f1115;
    border: 1px solid #1c1f29;
    border-radius: 12px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .workspace.with-detail .list-pane {
    border-right: 0;
    border-radius: 12px 0 0 12px;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    border-bottom: 1px solid #1c1f29;
    background: #0a0c10;
    flex-wrap: wrap;
  }
  .search {
    flex: 1;
    min-width: 200px;
    background: #161922;
    border: 1px solid #2a2f3c;
    border-radius: 7px;
    padding: 7px 12px;
    color: #e6e8ee;
    font-size: 12px;
    transition: border-color 0.12s ease, box-shadow 0.12s ease;
  }
  .search:focus {
    outline: none;
    border-color: #6ee7b7;
    box-shadow: 0 0 0 3px rgba(110, 231, 183, 0.12);
  }
  .filter-tabs, .scope-tabs {
    display: flex;
    gap: 2px;
    background: #161922;
    border: 1px solid #2a2f3c;
    border-radius: 7px;
    padding: 2px;
  }
  .filter-tabs button, .scope-tabs button {
    background: transparent;
    border: 0;
    color: #8a92a6;
    padding: 5px 10px;
    border-radius: 5px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 500;
    transition: background 0.12s ease, color 0.12s ease;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    text-transform: lowercase;
    font-family: ui-monospace, monospace;
  }
  .filter-tabs button:hover, .scope-tabs button:hover {
    color: #e6e8ee;
  }
  .filter-tabs button.active {
    background: rgba(110, 231, 183, 0.1);
    color: #6ee7b7;
  }
  .scope-tabs button.active {
    background: rgba(252, 211, 77, 0.1);
    color: #fcd34d;
  }
  .count {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 999px;
    padding: 0 6px;
    font-size: 10px;
    color: #5b637a;
  }
  .filter-tabs button.active .count {
    background: rgba(110, 231, 183, 0.15);
    color: #6ee7b7;
  }
  .dot-mini {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: #3a4150;
  }
  .dot-mini.on {
    background: #6ee7b7;
    box-shadow: 0 0 4px rgba(110, 231, 183, 0.6);
  }
  .dot-mini.override {
    background: #fcd34d;
    box-shadow: 0 0 4px rgba(252, 211, 77, 0.6);
  }
  .rows {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }
  .loading,
  .empty {
    padding: 48px;
    text-align: center;
    color: #5b637a;
    font-style: italic;
  }
  .footer-hint {
    padding: 8px 16px;
    border-top: 1px solid #1c1f29;
    background: #0a0c10;
    color: #5b637a;
    font-size: 10px;
    font-family: ui-monospace, monospace;
    letter-spacing: 0.02em;
  }
  @media (max-width: 1100px) {
    .workspace {
      grid-template-columns: 1fr;
    }
    .workspace.with-detail .list-pane {
      display: none;
    }
  }
</style>
