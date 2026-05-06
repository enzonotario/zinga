<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';

interface ReleaseAsset {
  name: string
  browser_download_url: string
}

interface GitHubRelease {
  tag_name: string
  html_url: string
  assets: ReleaseAsset[]
}

const release = ref<GitHubRelease | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

const fallbackReleaseUrl = 'https://github.com/enzonotario/zinga/releases/latest';

const downloads = computed(() => {
  const assets = release.value?.assets || [];

  return [
    {
      label: 'Linux (AppImage)',
      asset: findAsset(assets, '.appimage'),
    },
    {
      label: 'Linux (DEB)',
      asset: findAsset(assets, '.deb'),
    },
    {
      label: 'Linux (RPM)',
      asset: findAsset(assets, '.rpm'),
    },
    {
      label: 'Windows',
      asset: findAsset(assets, '.exe') || findAsset(assets, '.msi'),
    },
    {
      label: 'macOS',
      asset: findAsset(assets, '.dmg'),
    },
  ];
});

onMounted(() => loadLatestRelease());

async function loadLatestRelease() {
  loading.value = true;
  error.value = null;

  try {
    const response = await fetch('https://api.github.com/repos/enzonotario/zinga/releases/latest');

    if (!response.ok)
      throw new Error('No se pudo obtener la última release');

    release.value = await response.json();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'No se pudo obtener la última release';
  } finally {
    loading.value = false;
  }
}

function findAsset(assets: ReleaseAsset[], extension: string) {
  return assets.find((asset) => asset.name.toLowerCase().endsWith(extension)) || null;
}
</script>

<template>
  <div class="release-downloads">
    <p v-if="loading" class="release-downloads__muted">
      Buscando la última versión...
    </p>

    <p v-else-if="error" class="release-downloads__muted">
      {{ error }}. Podés descargarla desde
      <a :href="fallbackReleaseUrl" target="_blank" rel="noopener">GitHub Releases</a>.
    </p>

    <template v-else>
      <p class="release-downloads__muted">
        Última versión:
        <a :href="release?.html_url || fallbackReleaseUrl" target="_blank" rel="noopener">
          {{ release?.tag_name }}
        </a>
      </p>

      <ul>
        <li v-for="download in downloads" :key="download.label">
          <template v-if="download.asset">
            {{ download.label }}:
            <a :href="download.asset.browser_download_url" target="_blank" rel="noopener">
              {{ download.asset.name }}
            </a>
          </template>
          <template v-else>
            {{ download.label }}: todavía no publicado
          </template>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.release-downloads {
  padding: 16px 18px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
}

.release-downloads__muted {
  margin: 0 0 10px;
  color: var(--vp-c-text-2);
}

.release-downloads ul {
  margin: 0;
}
</style>
