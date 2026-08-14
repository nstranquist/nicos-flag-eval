<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import Toggle from "../../../components/Toggle.svelte";

  const noop = () => {};
  const { Story } = defineMeta({
    title: "Primitives/Toggle",
    component: Toggle,
    args: { onclick: noop },
  });
</script>

<Story name="Off" args={{ on: false, overridden: false, busy: false, disabled: false }} />
<Story name="On" args={{ on: true, overridden: false, busy: false, disabled: false }} />
<Story name="Overridden" args={{ on: true, overridden: true, busy: false, disabled: false }} />
