export default defineAppConfig({
  icon: {
    mode: 'svg',
  },
  app: {
    name: 'Zinga',
    author: 'Enzo Notario',
    description: 'A cross-platform UPnP music player',
    repo: 'https://github.com/enzonotario/zinga',
    sponsorUrl: 'https://github.com/sponsors/enzonotario',
  },
  pageCategories: {
    main: {
      labelKey: 'categories.main',
      icon: 'lucide:home',
    },
    upnp: {
      labelKey: 'categories.upnp',
      icon: 'lucide:router',
    },
    settings: {
      labelKey: 'categories.settings',
      icon: 'lucide:settings',
    },
    other: {
      labelKey: 'categories.other',
      icon: 'lucide:folder',
    },
    debug: {
      labelKey: 'categories.debug',
      icon: 'lucide:bug',
    },
  },
  ui: {
    colors: {
      primary: 'indigo',
      neutral: 'zinc',
    },
    icons: {
      light: 'i-heroicons-sun',
      dark: 'i-heroicons-moon',
      system: 'i-heroicons-computer-desktop',
    },
    button: {
      slots: {
        base: 'cursor-pointer',
      },
    },
    formField: {
      slots: {
        root: 'w-full',
      },
    },
    input: {
      slots: {
        root: 'w-full',
      },
    },
    textarea: {
      slots: {
        root: 'w-full',
        base: 'resize-none',
      },
    },
    accordion: {
      slots: {
        trigger: 'cursor-pointer',
        item: 'md:py-2',
      },
    },
    navigationMenu: {
      slots: {
        link: 'cursor-pointer',
      },
      variants: {
        disabled: {
          true: {
            link: 'cursor-text',
          },
        },
      },
    },
    card: {
      slots: {
        root: 'bg-white/70! dark:bg-neutral-900/80! backdrop-blur-sm',
      },
      variants: {
        variant: {
          soft: {
            root: 'border border-neutral-300 dark:border-neutral-700 bg-transparent! dark:bg-transparent!',
          },
        },
      },
    },
    empty: {
      slots: {
        root: 'bg-white/70! dark:bg-neutral-900/80! backdrop-blur-sm',
      },
    },
    badge: {
      slots: {
        base: 'bg-neutral-200/70! dark:bg-neutral-700/80! backdrop-blur-sm',
      },
      variants: {
        variant: {
          soft: {
            base: 'border border-neutral-300 dark:border-neutral-700 bg-transparent! dark:bg-transparent!',
          },
        },
      },
    },
  },
});
