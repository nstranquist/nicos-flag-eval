<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import FlagDetail from "../../../components/FlagDetail.svelte";
  import { demoAudit, promoEnvResults, promoFlag, promoOn, rankingEnvResults, rankingFlag, rankingResult } from "../demo-flags";

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

<Story name="Promo banner" args={{ flag: promoFlag, previewEnvResults: promoEnvResults }} />
<Story name="Ranking variant" args={{ flag: rankingFlag, previewResult: rankingResult, previewEnvResults: rankingEnvResults }} />
