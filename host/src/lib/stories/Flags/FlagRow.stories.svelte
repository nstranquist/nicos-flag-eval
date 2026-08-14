<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import FlagRow from "../../../components/FlagRow.svelte";
  import { promoFlag, promoOff, promoOn, promoOverride, rankingFlag, rankingResult } from "../demo-flags";

  const noop = () => {};
  const { Story } = defineMeta({
    title: "Flags/List/FlagRow",
    component: FlagRow,
    args: { onclick: noop, ontoggle: noop, oneditvalue: noop },
  });
</script>

<Story name="Default (off)"
  args={{ flag: promoFlag, result: promoOff, selected: false, busy: false, hasOverride: false }} />

<Story name="On via rule"
  args={{ flag: promoFlag, result: promoOn, selected: false, busy: false, hasOverride: false }} />

<Story name="Has override"
  args={{ flag: promoFlag, result: promoOverride, selected: false, busy: false, hasOverride: true }} />

<Story name="String ranking arm"
  args={{ flag: rankingFlag, result: rankingResult, selected: false, busy: false, hasOverride: false }} />
