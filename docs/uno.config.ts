import { defineConfig, presetWind } from 'unocss';

export default defineConfig({
  presets: [presetWind()],
  content: {
    filesystem: [
      '.vitepress/**/*.{js,ts,vue}',
      '**/*.md',
    ],
  },
});
