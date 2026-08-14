<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import AuditTimeline from "../../../components/AuditTimeline.svelte";
  import { promoFlag } from "../demo-flags";

  const { Story } = defineMeta({
    title: "Flags/AuditTimeline",
    component: AuditTimeline,
  });
</script>

<Story name="Promo history" args={{ flagKey: promoFlag.key, refreshToken: 0 }} />
