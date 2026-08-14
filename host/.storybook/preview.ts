import type { Preview } from "@storybook/svelte";

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: "demo-bg",
      values: [
        { name: "demo-bg", value: "#0a0c10" },
        { name: "demo-surface", value: "#0f1115" },
      ],
    },
    layout: "centered",
  },
};

export default preview;
