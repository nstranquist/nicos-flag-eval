import type { StorybookConfig } from "storybook";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(js|ts|svelte)"],
  addons: ["@storybook/addon-svelte-csf", "@storybook/addon-docs"],
  framework: { name: "@storybook/svelte-vite", options: {} },
};

export default config;
