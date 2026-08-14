<script lang="ts">
  interface Props {
    label: string;
    value: string | number;
    sub?: string;
    accent?: string;
  }
  let { label, value, sub = "", accent = "#6ee7b7" }: Props = $props();
</script>

<div class="card">
  <div class="label">{label}</div>
  <div class="value" style:color={accent}>{value}</div>
  {#if sub}<div class="sub">{sub}</div>{/if}
</div>

<style>
  .card {
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.025), rgba(255, 255, 255, 0));
    border: 1px solid #2a2f3c;
    border-radius: 14px;
    padding: 18px 20px;
    position: relative;
    overflow: hidden;
    transition: border-color 0.15s ease;
  }
  .card:hover {
    border-color: #3a4150;
  }
  .label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #8a92a6;
    margin-bottom: 8px;
  }
  .value {
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.02em;
    font-feature-settings: "tnum";
    line-height: 1;
  }
  .sub {
    margin-top: 6px;
    font-size: 12px;
    color: #8a92a6;
  }
</style>
