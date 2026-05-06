import DefaultTheme from 'vitepress/theme';
import ReleaseDownloads from './components/ReleaseDownloads.vue';
import '@unocss/reset/tailwind.css';

import 'virtual:uno.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('ReleaseDownloads', ReleaseDownloads);
  },
};
