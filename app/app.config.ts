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
    tv: {
      twMergeConfig: {
        extend: {
          classGroups: {
            'bg-color': ['glass', 'glass-soft'],
          },
        },
      },
    },
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
        root: 'rounded-xl',
      },
      variants: {
        variant: {
          outline: {
            root: 'glass ring ring-default divide-y divide-default',
          },
          soft: {
            root: 'bg-transparent divide-y divide-default',
          },
          subtle: {
            root: 'glass-soft ring ring-default divide-y divide-default',
          },
        },
      },
    },
    empty: {
      variants: {
        variant: {
          outline: {
            root: 'glass ring ring-default',
          },
        },
      },
      defaultVariants: {
        variant: 'naked',
      },
    },
    badge: {
      compoundVariants: [
        {
          color: 'neutral',
          variant: 'soft',
          class: 'bg-default/60 backdrop-blur-sm ring ring-inset ring-default',
        },
        {
          color: 'neutral',
          variant: 'subtle',
          class: 'bg-default/60 backdrop-blur-sm',
        },
      ],
    },
  },
});
