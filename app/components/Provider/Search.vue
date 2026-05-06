<script lang="ts" setup>
import type { SearchResults } from '~/providers/types';
import { useDebounceFn } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import useProvider from '~/composables/useProvider';

const emit = defineEmits<{ close: [boolean] }>();
const { t } = useI18n();
const provider = useProvider();
const query = ref('');
const loading = ref(false);
const open = ref(false);
const results = ref<SearchResults>({
  artists: [],
  albums: [],
  tracks: [],
});
const performSearch = useDebounceFn(async (searchQuery: string) => {
  if (!searchQuery.trim() || searchQuery.length < 2) {
    results.value = { artists: [], albums: [], tracks: [] };
    return;
  }
  loading.value = true;
  try {
    results.value = await provider.searchAll(searchQuery, 5);
  } catch (err) {
    console.error('Error en búsqueda:', err);
    results.value = { artists: [], albums: [], tracks: [] };
  } finally {
    loading.value = false;
  }
}, 300);
watch(query, (newQuery) => performSearch(newQuery));
const groups = computed(() => {
  const commandGroups: any[] = [];
  if (results.value.artists.length > 0) {
    commandGroups.push({
      id: 'artists',
      label: t('search.artists'),
      items: results.value.artists.map((artist) => ({
        id: `artist-${artist.id}`,
        label: artist.name,
        icon: 'i-heroicons-user',
        avatar: artist.picture ? { src: artist.picture, alt: artist.name } : undefined,
        to: `/artist/${artist.id}`,
      })),
    });
  }
  if (results.value.albums.length > 0) {
    commandGroups.push({
      id: 'albums',
      label: t('search.albums'),
      items: results.value.albums.map((album) => ({
        id: `album-${album.id}`,
        label: album.title,
        icon: 'i-heroicons-musical-note',
        avatar: album.coverUrl ? { src: album.coverUrl, alt: album.title } : undefined,
        to: `/album/${album.id}`,
      })),
    });
  }
  if (results.value.tracks.length > 0) {
    commandGroups.push({
      id: 'tracks',
      label: t('search.tracks'),
      items: results.value.tracks.map((track) => ({
        id: `track-${track.id}`,
        label: track.title,
        icon: 'i-heroicons-musical-note',
        to: `/track/${track.id}`,
      })),
    });
  }
  return commandGroups;
});
function onItemSelect(item: any) {
  if (item) open.value = false;
}
watch(open, (isOpen) => {
  if (!isOpen) {
    query.value = '';
    results.value = { artists: [], albums: [], tracks: [] };
    emit('close', true);
  }
});
</script>

<template>
  <UModal v-model:open="open" class="sm:max-w-2xl">
    <UButton icon="i-heroicons-magnifying-glass" variant="ghost">
      {{ $t('search.button') }}
    </UButton>
    <template #content>
      <UCommandPalette
        v-model:search-term="query"
        :groups="groups"
        :loading="loading"
        :placeholder="$t('search.placeholder')"
        :autofocus="true"
        close
        @update:open="(value: boolean) => { if (!value) open = false }"
        @update:model-value="onItemSelect"
      >
        <template #empty>
          <div class="flex flex-col items-center justify-center gap-4 py-8 text-center">
            <UIcon
              name="i-heroicons-magnifying-glass"
              class="w-12 h-12 text-muted"
            />
            <p class="text-sm text-muted">
              {{ query.length < 2 ? $t('search.minChars') : $t('search.noResults') }}
            </p>
          </div>
        </template>
      </UCommandPalette>
    </template>
  </UModal>
</template>
