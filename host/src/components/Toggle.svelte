<script lang="ts">
  interface Props {
    on: boolean;
    /** When true the toggle is yellow-tinted, signalling an active
     *  override is winning over the manifest default. */
    overridden?: boolean;
    busy?: boolean;
    disabled?: boolean;
    onclick: (ev: MouseEvent) => void;
    title?: string;
  }
  let { on, overridden = false, busy = false, disabled = false, onclick, title }: Props = $props();
</script>

<button
  type="button"
  class="toggle"
  class:on
  class:overridden
  class:busy
  aria-pressed={on}
  aria-busy={busy}
  {disabled}
  onclick={(ev) => { ev.stopPropagation(); onclick(ev); }}
  {title}
>
  <span class="track">
    <span class="knob"></span>
    {#if busy}<span class="spinner"></span>{/if}
  </span>
</button>

<style>
  .toggle {
    --w: 38px;
    --h: 22px;
    --pad: 3px;
    --knob: calc(var(--h) - var(--pad) * 2);
    background: transparent;
    border: 0;
    padding: 0;
    cursor: pointer;
    line-height: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .toggle:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }
  .track {
    position: relative;
    width: var(--w);
    height: var(--h);
    background: #2a2f3c;
    border-radius: 999px;
    transition: background 0.18s ease, box-shadow 0.18s ease;
  }
  .knob {
    position: absolute;
    top: var(--pad);
    left: var(--pad);
    width: var(--knob);
    height: var(--knob);
    background: #8a92a6;
    border-radius: 999px;
    transition: transform 0.18s cubic-bezier(.34,1.56,.64,1), background 0.18s ease;
  }
  .toggle.on .track {
    background: #14532d;
  }
  .toggle.on .knob {
    background: #6ee7b7;
    transform: translateX(calc(var(--w) - var(--knob) - var(--pad) * 2));
    box-shadow: 0 0 8px rgba(110, 231, 183, 0.6);
  }
  .toggle.overridden .track {
    background: #5a4406;
    box-shadow: inset 0 0 0 1px rgba(252, 211, 77, 0.5);
  }
  .toggle.overridden.on .track {
    background: #5a4406;
    box-shadow: inset 0 0 0 1px rgba(252, 211, 77, 0.7);
  }
  .toggle.overridden .knob {
    background: #fcd34d;
    box-shadow: 0 0 8px rgba(252, 211, 77, 0.5);
  }
  .toggle:not(:disabled):hover .track {
    filter: brightness(1.15);
  }
  .toggle:not(:disabled):active .knob {
    transform: scale(0.9) translateX(var(--knob-tx, 0));
  }
  .toggle:not(:disabled).on:active .knob {
    --knob-tx: calc(var(--w) - var(--knob) - var(--pad) * 2);
  }
  .busy .knob {
    opacity: 0.3;
  }
  .spinner {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 10px;
    height: 10px;
    margin: -5px 0 0 -5px;
    border-radius: 999px;
    border: 2px solid rgba(252, 211, 77, 0.3);
    border-top-color: #fcd34d;
    animation: spin 0.6s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
