<script lang="ts" setup>
import type { LocalTrack } from '~/composables/useLocalLibrary';
import { computed, onMounted, ref } from 'vue';
import useLocalLibrary from '~/composables/useLocalLibrary';

const { t } = useI18n();
const { tracks, loadTracks, scanning } = useLocalLibrary();
const player = usePlayer();

type LocalViewMode = 'folders' | 'artists' | 'albums' | 'all';
const viewMode = ref<LocalViewMode>('all');
const search = ref('');

onMounted(async () => {
  await loadTracks();
});

const filteredTracks = computed(() => {
  if (!search.value) return tracks.value;
  const s = search.value.toLowerCase();
  return tracks.value.filter((t) =>
    t.title.toLowerCase().includes(s)
    || t.artist.toLowerCase().includes(s)
    || t.album.toLowerCase().includes(s)
    || t.path.toLowerCase().includes(s),
  );
});

const groupedByFolder = computed(() => {
  const groups: Record<string, LocalTrack[]> = {};
  filteredTracks.value.forEach((t) => {
    const folder = t.path.substring(0, t.path.lastIndexOf('/'));
    if (!groups[folder]) groups[folder] = [];
    groups[folder].push(t);
  });

  const sortedKeys = Object.keys(groups).sort();
  const sortedGroups: Record<string, LocalTrack[]> = {};
  sortedKeys.forEach((key) => {
    sortedGroups[key] = groups[key];
  });

  return sortedGroups;
});

const groupedByArtist = computed(() => {
  const groups: Record<string, LocalTrack[]> = {};
  filteredTracks.value.forEach((t) => {
    if (!groups[t.artist]) groups[t.artist] = [];
    groups[t.artist].push(t);
  });

  const sortedKeys = Object.keys(groups).sort();
  const sortedGroups: Record<string, LocalTrack[]> = {};
  sortedKeys.forEach((key) => {
    sortedGroups[key] = groups[key];
  });

  return sortedGroups;
});

const groupedByAlbum = computed(() => {
  const groups: Record<string, LocalTrack[]> = {};
  filteredTracks.value.forEach((t) => {
    const key = `${t.artist} - ${t.album}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });

  const sortedKeys = Object.keys(groups).sort();
  const sortedGroups: Record<string, LocalTrack[]> = {};
  sortedKeys.forEach((key) => {
    sortedGroups[key] = groups[key];
  });

  return sortedGroups;
});

function playTrack(track: LocalTrack) {
  player.playUris([track.uri]);
}

function playAll(tracksToPlay: LocalTrack[]) {
  if (tracksToPlay.length === 0) return;
  player.playUris(tracksToPlay.map((t) => t.uri));
}

function getTotalDuration(tracksToSum: LocalTrack[]) {
  return tracksToSum.reduce((acc, t) => acc + t.duration, 0);
}

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-4">
      <UTabs
        v-model="viewMode"
        :items="[
          { label: t('common.all'), value: 'all' },
          { label: t('common.folders'), value: 'folders' },
          { label: t('pages.library.artists'), value: 'artists' },
          { label: t('pages.library.albums'), value: 'albums' },
        ]"
      />
      <UInput
        v-model="search"
        icon="i-heroicons-magnifying-glass"
        :placeholder="t('common.searchLocalPlaceholder')"
        class="max-w-xs"
      />
    </div>

    <div v-if="scanning && tracks.length === 0" class="flex flex-col items-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary" />
      <p class="mt-2 text-sm text-(--ui-text-muted)">
        {{ t('common.scanning') }}
      </p>
    </div>

    <div v-else-if="tracks.length === 0" class="py-12">
      <UEmpty
        icon="i-heroicons-musical-note"
        :title="t('common.emptyLibrary')"
        :description="t('common.emptyLibraryDescription')"
      />
    </div>

    <div v-else class="space-y-6">
      <div v-if="viewMode === 'all'" class="border border-(--ui-border) rounded-lg overflow-hidden">
        <table class="w-full text-sm text-left">
          <thead class="bg-(--ui-bg-elevated) text-(--ui-text-muted) uppercase text-xs">
            <tr>
              <th class="px-4 py-2 font-medium">
                {{ t('pages.library.colTitle') }}
              </th>
              <th class="px-4 py-2 font-medium">
                {{ t('pages.library.colArtist') }}
              </th>
              <th class="px-4 py-2 font-medium">
                {{ t('pages.library.colAlbum') }}
              </th>
              <th class="px-4 py-2 font-medium text-right">
                {{ t('pages.library.colDuration') }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-(--ui-border)">
            <tr
              v-for="track in filteredTracks"
              :key="track.uri"
              class="hover:bg-primary/5 cursor-pointer transition-colors group"
              @click="playTrack(track)"
            >
              <td class="px-4 py-3 flex items-center gap-2">
                <div class="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden relative">
                  <img v-if="track.cover" :src="track.cover" class="w-full h-full object-cover" :alt="t('common.cover')">
                  <UIcon v-else name="i-heroicons-musical-note" class="w-4 h-4 text-primary group-hover:hidden" />
                  <div class="absolute inset-0 bg-black/40 hidden group-hover:flex items-center justify-center">
                    <UIcon name="i-heroicons-play" class="w-4 h-4 text-white" />
                  </div>
                </div>
                <span class="font-medium truncate max-w-[300px]">{{ track.title }}</span>
              </td>
              <td class="px-4 py-3 text-(--ui-text-muted)">
                {{ track.artist }}
              </td>
              <td class="px-4 py-3 text-(--ui-text-muted)">
                {{ track.album }}
              </td>
              <td class="px-4 py-3 text-right text-(--ui-text-muted)">
                {{ formatDuration(track.duration) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="space-y-4">
        <div
          v-for="(groupTracks, name) in (viewMode === 'folders' ? groupedByFolder : viewMode === 'artists' ? groupedByArtist : groupedByAlbum)"
          :key="name"
          class="space-y-2"
        >
          <div class="flex items-center justify-between sticky top-0 bg-(--ui-bg) py-2 z-10 border-b border-(--ui-border)">
            <h4 class="font-bold flex items-center gap-2">
              <UIcon :name="viewMode === 'folders' ? 'i-heroicons-folder' : 'i-heroicons-user'" class="text-primary" />
              {{ name }}
              <span class="text-xs font-normal text-(--ui-text-muted)">
                ({{ groupTracks.length }} {{ t('common.tracks') }} - {{ formatDuration(getTotalDuration(groupTracks)) }})
              </span>
            </h4>
            <UButton variant="ghost" size="xs" icon="i-heroicons-play-circle" @click="playAll(groupTracks)">
              {{ t('common.playGroup') }}
            </UButton>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            <div
              v-for="track in groupTracks"
              :key="track.uri"
              class="p-2 rounded-lg border border-(--ui-border) hover:border-primary/50 flex items-center gap-3 cursor-pointer group bg-(--ui-bg-elevated)"
              @click="playTrack(track)"
            >
              <div class="w-10 h-10 rounded bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden relative">
                <img v-if="track.cover" :src="track.cover" class="w-full h-full object-cover" :alt="t('common.cover')">
                <UIcon v-else name="i-heroicons-musical-note" class="w-5 h-5 text-primary group-hover:hidden" />
                <div class="absolute inset-0 bg-black/40 hidden group-hover:flex items-center justify-center">
                  <UIcon name="i-heroicons-play" class="w-5 h-5 text-white" />
                </div>
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium truncate">
                  {{ track.title }}
                </p>
                <p class="text-xs text-(--ui-text-muted) truncate">
                  {{ track.artist }} - {{ track.album }}
                </p>
              </div>
              <span class="text-xs text-(--ui-text-muted)">{{ formatDuration(track.duration) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
