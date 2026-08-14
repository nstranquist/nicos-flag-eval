<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import OverrideEditor from "../../../components/OverrideEditor.svelte";
  import { promoFlag, shippingFlag, rankingFlag } from "../demo-flags";

  const noop = () => {};
  const { Story } = defineMeta({
    title: "Flags/OverrideEditor",
    component: OverrideEditor,
    args: { onchange: noop, currentOverride: undefined, overrideMeta: null, envName: "staging", skipRemote: true },
  });
</script>

<Story name="Boolean promo" args={{ flag: promoFlag }} />
<Story name="Number shipping" args={{ flag: shippingFlag }} />
<Story name="String ranking" args={{ flag: rankingFlag }} />
