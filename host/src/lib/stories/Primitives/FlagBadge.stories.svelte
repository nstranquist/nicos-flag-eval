<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import FlagBadge from "../../../components/FlagBadge.svelte";

  const { Story } = defineMeta({
    title: "Primitives/FlagBadge",
    component: FlagBadge,
  });
</script>

<Story name="Rule" args={{ source: "rule" }} />
<Story name="Default" args={{ source: "default" }} />
<Story name="Override" args={{ source: "cloud-override" }} />
