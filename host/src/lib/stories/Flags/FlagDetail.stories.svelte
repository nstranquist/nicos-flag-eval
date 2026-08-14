<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import FlagDetail from "../../../components/FlagDetail.svelte";
  import { demoAudit, promoFlag, promoOn, rankingFlag } from "../demo-flags";

  const noop = () => {};
  const { Story } = defineMeta({
    title: "Flags/FlagDetail",
    component: FlagDetail,
    args: {
      currentOverride: undefined,
      overrideMeta: null,
      envName: "staging",
      refreshToken: 0,
      onclose: noop,
      onchange: noop,
      skipRemote: true,
      previewResult: promoOn,
      previewEvents: demoAudit(promoFlag.key),
    },
  });
</script>

<Story name="Promo banner" args={{ flag: promoFlag }} />
<Story name="Ranking variant" args={{ flag: rankingFlag }} />
