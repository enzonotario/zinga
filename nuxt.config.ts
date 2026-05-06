import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8')) as { version?: string };

export default defineNuxtConfig({
  runtimeConfig: {
    public: {
      appVersion: pkg.version ?? '0.0.0',
    },
  },
  ui: {
    theme: {
      defaultVariants: {
        color: 'neutral',
      },
    },
  },
  modules: [
    '@vueuse/nuxt',
    '@nuxt/ui',
    'nuxt-svgo',
    'reka-ui/nuxt',
    '@nuxt/eslint',
    '@nuxt/image',
    '@nuxtjs/i18n',
  ],
  i18n: {
    locales: [
      { code: 'en', name: 'English', file: 'en.json' },
      { code: 'es', name: 'Español', file: 'es.json' },
    ],
    defaultLocale: 'en',
    langDir: 'locales',
    strategy: 'no_prefix',
  },
  app: {
    head: {
      title: 'Zinga',
      charset: 'utf-8',
      viewport: 'width=device-width, initial-scale=1',
      meta: [
        { name: 'format-detection', content: 'no' },
      ],
    },
    pageTransition: {
      name: 'page',
      mode: 'out-in',
    },
    layoutTransition: {
      name: 'layout',
      mode: 'out-in',
    },
    keepalive: true,
  },
  css: [
    '@/assets/css/main.css',
  ],
  icon: {
    customCollections: [
      {
        prefix: 'local',
        dir: './app/assets/icons',
      },
    ],
    provider: 'none',
    fallbackToApi: false,
    clientBundle: {
      scan: {
        globInclude: [
          '**/*.{vue,jsx,tsx,md,mdc,mdx,yml,yaml}',
          '**/*.ts',
        ],
      },
      includeCustomCollections: true,
      sizeLimitKb: 512,
    },
  },
  svgo: {
    autoImportPath: '@/assets/',
  },
  ssr: false,
  dir: {
    modules: 'app/modules',
  },
  imports: {
    presets: [
      {
        from: 'zod',
        imports: [
          'z',
          {
            name: 'infer',
            as: 'zInfer',
            type: true,
          },
        ],
      },
    ],
  },
  vite: {
    clearScreen: false,
    envPrefix: ['VITE_', 'TAURI_'],
    server: {
      strictPort: true,
      hmr: {
        protocol: 'ws',
        host: '0.0.0.0',
        port: 3001,
      },
      watch: {
        ignored: ['**/src-tauri/**'],
      },
    },
  },
  devServer: {
    host: '0.0.0.0',
  },
  router: {
    options: {
      scrollBehaviorType: 'smooth',
    },
  },
  eslint: {
    config: {
      standalone: false,
    },
  },
  debug: true,
  devtools: {
    enabled: false,
  },
  experimental: {
    typedPages: true,
  },
  compatibilityDate: '2025-07-01',
});
