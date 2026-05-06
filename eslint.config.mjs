import eslintConfig from '@antfu/eslint-config';
import nuxtConfig from './.nuxt/eslint.config.mjs';

export default eslintConfig(
  {
    lessOpinionated: true,
    typescript: true,
    vue: true,
    ignores: ['src-tauri/gen/**', '**/*.md', 'docs/node_modules/**', 'docs/.vitepress/dist/**', 'docs/.vitepress/cache/**'],
    stylistic: {
      indent: 2,
      quotes: 'single',
    },
    rules: {
      curly: 'off',
      'no-console': 'off',
      'no-new-func': 'off',
      'style/semi': ['error', 'always'],
      'style/quote-props': ['warn', 'as-needed'],
      'style/brace-style': ['warn', '1tbs'],
      'style/arrow-parens': ['error', 'always'],
      'vue/block-order': ['error', {
        order: ['script', 'template', 'style'],
      }],
      'vue/script-indent': ['error', 2, {
        baseIndent: 0,
      }],
      'antfu/top-level-function': 'off',
      'antfu/if-newline': 'off',
      'new-cap': 'off',
      'node/prefer-global/process': ['off'],
      'style/comma-dangle': ['error', 'always-multiline'],
      'vue/comma-dangle': ['error', 'always-multiline'],
    },
  },
  {
    files: ['**/*.vue'],
    rules: {
      'style/indent': 'off',
    },
  },
  {
    files: ['src-tauri/remote-client/**/*.js'],
    languageOptions: {
      globals: {
        Vue: 'readonly',
      },
    },
  },

  nuxtConfig(),
);
