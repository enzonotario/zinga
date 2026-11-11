import UnoCSS from 'unocss/vite';

const SITE_URL = 'https://zinga.enzonotario.me';
const SITE_TITLE = 'Zinga';
const SITE_DESCRIPTION
  = 'Reproductor de música para dispositivos UPnP, con TIDAL, YouTube Music y biblioteca local';
const OG_IMAGE = `${SITE_URL}/og/zinga-og-dark.png`;
const OG_IMAGE_ALT = 'Zinga — Music app for UPnP devices';

const brandStyle = `:root {
  --vp-c-brand: #52525b;
  --vp-c-brand-1: #52525b;
  --vp-c-brand-2: #71717a;
  --vp-c-brand-3: #3f3f46;
  --vp-c-brand-soft: #f4f4f5;
  --vp-c-indigo-1: #52525b;
  --vp-c-indigo-2: #71717a;
  --vp-c-indigo-3: #3f3f46;
  --vp-c-indigo-soft: #f4f4f5;
}
.dark {
  --vp-c-brand: #a1a1aa;
  --vp-c-brand-1: #a1a1aa;
  --vp-c-brand-2: #d4d4d8;
  --vp-c-brand-3: #71717a;
  --vp-c-brand-soft: #27272a;
  --vp-c-indigo-1: #a1a1aa;
  --vp-c-indigo-2: #d4d4d8;
  --vp-c-indigo-3: #71717a;
  --vp-c-indigo-soft: #27272a;
}`;

export default {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  lang: 'es-AR',
  head: [
    ['style', {}, brandStyle],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/assets/logo-black.svg' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: SITE_TITLE }],
    ['meta', { property: 'og:locale', content: 'es_AR' }],
    ['meta', { property: 'og:title', content: SITE_TITLE }],
    ['meta', { property: 'og:description', content: SITE_DESCRIPTION }],
    ['meta', { property: 'og:url', content: `${SITE_URL}/` }],
    ['meta', { property: 'og:image', content: OG_IMAGE }],
    ['meta', { property: 'og:image:type', content: 'image/png' }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],
    ['meta', { property: 'og:image:alt', content: OG_IMAGE_ALT }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: SITE_TITLE }],
    ['meta', { name: 'twitter:description', content: SITE_DESCRIPTION }],
    ['meta', { name: 'twitter:image', content: OG_IMAGE }],
    ['meta', { name: 'twitter:image:alt', content: OG_IMAGE_ALT }],
  ],
  vite: {
    plugins: [UnoCSS()],
  },
  themeConfig: {
    logo: {
      light: '/assets/logo-black.svg',
      dark: '/assets/logo-white.svg',
      alt: 'Zinga',
    },
    nav: [],
    sidebar: [
      {
        text: 'Guia de usuario',
        items: [
          { text: 'Primeros pasos', link: '/getting-started' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/enzonotario/zinga' },
    ],
    footer: {
      message: 'Released under the <a href="https://github.com/enzonotario/zinga/blob/main/LICENSE">MIT License</a>.',
      copyright: 'Copyright © 2026-present <a href="https://enzonotario.me">Enzo Notario</a>',
    },
  },
};
