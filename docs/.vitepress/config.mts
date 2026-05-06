import UnoCSS from 'unocss/vite';

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
  title: 'Zinga',
  description: 'Reproductor de Música para dispositivos UPnP',
  lang: 'es-AR',
  head: [['style', {}, brandStyle]],
  vite: {
    plugins: [UnoCSS()],
  },
  themeConfig: {
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
