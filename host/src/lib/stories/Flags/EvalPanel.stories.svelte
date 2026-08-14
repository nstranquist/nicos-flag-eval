<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import EvalPanel from "../../../components/EvalPanel.svelte";
  import { promoFlag, promoOn } from "../demo-flags";

  const { Story } = defineMeta({
    title: "Flags/EvalPanel",
    component: EvalPanel,
  });
</script>

<Story name="Promo banner" args={{ flag: promoFlag, previewResult: promoOn }} />
