<script lang="ts" setup>
import type { ContextMenuItem } from '@nuxt/ui';
import type { NormalizedAlbum } from '~/providers/types';
import type { DropPlacement } from '~/utils/collectionShelf';
import type { CollectionGroup, ColorBand } from '~/utils/collectionSort';
import { computed, ref } from 'vue';
import useCollectionSort from '~/composables/useCollectionSort';
import { COLOR_BAND_SWATCHES, quickJumpLetters, reorderIds, sameOrder, tidalCoverAtSize } from '~/utils/collectionShelf';
import { releaseYear } from '~/utils/collectionSort';

interface Props {
  groups: CollectionGroup[]
  sorted: NormalizedAlbum[]
  manual?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  manual: false,
});
const emit = defineEmits<{
  reorder: [albumIds: string[]]
}>();

const { t } = useI18n();
const { config } = useCollectionSort();

const contextAlbum = ref<NormalizedAlbum | null>(null);
const sortNameArtist = ref<{ id: string, name: string } | null>(null);
const sortNameOpen = ref(false);
const draggingId = ref<string | null>(null);
const previewIds = ref<string[] | null>(null);
const groupElements = new Map<string, HTMLElement>();

const showHeaders = computed(() => !props.manual && config.value.groupBy !== 'none');
const showRail = computed(() => showHeaders.value && config.value.groupBy === 'letter' && props.groups.length > 1);
const railLetters = computed(() => quickJumpLetters(props.groups, config.value.options.numbersFirst));

const albumsById = computed(() => new Map(props.sorted.map((album) => [album.id, album])));
const manualAlbums = computed(() => {
  if (!previewIds.value) return props.sorted;
  return previewIds.value.map((id) => albumsById.value.get(id)).filter((album): album is NormalizedAlbum => !!album);
});
const visibleGroups = computed<CollectionGroup[]>(() =>
  props.manual ? [{ key: 'manual', label: '', items: manualAlbums.value }] : props.groups,
);

const contextItems = computed<ContextMenuItem[][]>(() => {
  const album = contextAlbum.value;
  if (!album) return [];
  return [
    [{
      label: t('collectionSort.shelf.openAlbum'),
      icon: 'i-heroicons-arrow-top-right-on-square',
      onSelect: () => navigateTo(`/album/${album.id}`),
    }],
    album.artists.slice(0, 3).map((artist) => ({
      label: t('collectionSort.shelf.sortArtistAs', { artist: artist.name }),
      icon: 'i-heroicons-bars-arrow-down',
      onSelect: () => openSortName(artist),
    })),
  ];
});

function groupLabel(group: CollectionGroup) {
  return group.labelKey ? t(group.labelKey) : group.label;
}

function groupSwatch(group: CollectionGroup) {
  if (config.value.groupBy !== 'color') return null;
  return COLOR_BAND_SWATCHES[group.key as ColorBand] ?? null;
}

function isLargeLabel() {
  return config.value.groupBy === 'letter' || config.value.groupBy === 'decade';
}

function setGroupElement(key: string, el: unknown) {
  if (el instanceof HTMLElement) groupElements.set(key, el);
  else groupElements.delete(key);
}

function jumpTo(groupKey: string | null) {
  if (!groupKey) return;
  groupElements.get(groupKey)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function artistLabel(album: NormalizedAlbum) {
  return album.artists.map((a) => a.name).join(', ');
}

function typeBadge(album: NormalizedAlbum) {
  return album.type === 'EP' || album.type === 'SINGLE' ? t(`album.types.${album.type}`) : null;
}

function openSortName(artist: { id: string, name: string }) {
  sortNameArtist.value = artist;
  sortNameOpen.value = true;
}

function dropPlacement(event: DragEvent): DropPlacement {
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  return event.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
}

function onDragStart(album: NormalizedAlbum, event: DragEvent) {
  if (!props.manual) return;
  draggingId.value = album.id;
  previewIds.value = props.sorted.map((a) => a.id);
  event.dataTransfer?.setData('text/plain', album.id);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

function onDragOver(album: NormalizedAlbum, event: DragEvent) {
  if (!props.manual || !draggingId.value || !previewIds.value) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  if (album.id === draggingId.value) return;
  const next = reorderIds(previewIds.value, draggingId.value, album.id, dropPlacement(event));
  if (!sameOrder(next, previewIds.value)) previewIds.value = next;
}

function onContainerDragOver(event: DragEvent) {
  if (props.manual && draggingId.value) event.preventDefault();
}

function onDrop(event: DragEvent) {
  if (!props.manual || !previewIds.value) return;
  event.preventDefault();
  const next = previewIds.value;
  const changed = !sameOrder(next, props.sorted.map((a) => a.id));
  resetDrag();
  if (changed) emit('reorder', next);
}

function resetDrag() {
  draggingId.value = null;
  previewIds.value = null;
}
</script>

<template>
  <div class="flex gap-3">
    <UContextMenu :items="contextItems" class="flex-1 min-w-0">
      <div
        class="flex flex-col gap-6"
        @contextmenu.capture="contextAlbum = null"
        @dragover="onContainerDragOver"
        @drop="onDrop"
      >
        <p v-if="manual" class="flex items-center gap-2 text-sm text-muted">
          <UIcon name="i-heroicons-hand-raised" class="size-4 shrink-0" />
          {{ t('collectionSort.shelf.manualHint') }}
        </p>
        <section
          v-for="group in visibleGroups"
          :key="group.key"
          :ref="(el) => setGroupElement(group.key, el)"
          class="flex flex-col gap-3 scroll-mt-24"
        >
          <div v-if="showHeaders" class="sticky top-20 z-10 py-1 pointer-events-none">
            <div class="inline-flex items-center gap-3 glass ring ring-default rounded-full pl-3 pr-2 py-1 pointer-events-auto">
              <span
                v-if="groupSwatch(group)"
                class="size-5 rounded-full ring ring-default shrink-0"
                :style="{ backgroundColor: groupSwatch(group)! }"
              />
              <span
                class="font-semibold truncate max-w-[60vw]"
                :class="isLargeLabel() ? 'text-2xl leading-none tabular-nums' : 'text-base'"
              >
                {{ groupLabel(group) }}
              </span>
              <UBadge
                :label="String(group.items.length)"
                color="neutral"
                variant="subtle"
                size="sm"
              />
            </div>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
            <NuxtLink
              v-for="album in group.items"
              :key="album.id"
              :to="`/album/${album.id}`"
              :draggable="manual ? 'true' : 'false'"
              class="group flex flex-col gap-2 p-2 rounded-lg hover:bg-accented/40 transition-colors"
              :class="[
                manual ? 'cursor-grab active:cursor-grabbing' : '',
                draggingId === album.id ? 'opacity-40' : '',
              ]"
              @contextmenu="contextAlbum = album"
              @dragstart="onDragStart(album, $event)"
              @dragover="onDragOver(album, $event)"
              @dragend="resetDrag"
            >
              <div class="relative aspect-square w-full rounded-md overflow-hidden bg-accented/50 ring ring-default shadow-sm">
                <img
                  v-if="album.coverUrl"
                  :src="tidalCoverAtSize(album.coverUrl, 320)"
                  :alt="album.title"
                  loading="lazy"
                  decoding="async"
                  draggable="false"
                  class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                >
                <div v-else class="w-full h-full flex-center">
                  <UIcon name="i-heroicons-musical-note" class="size-10 text-muted" />
                </div>
                <UBadge
                  v-if="typeBadge(album)"
                  :label="typeBadge(album)!"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                  class="absolute top-1.5 right-1.5"
                />
              </div>
              <div class="min-w-0">
                <div class="font-medium text-sm truncate" :title="album.title">
                  {{ album.title }}
                </div>
                <div class="text-xs text-muted truncate" :title="artistLabel(album)">
                  {{ artistLabel(album) }}
                </div>
                <div v-if="releaseYear(album)" class="text-xs text-muted tabular-nums">
                  {{ releaseYear(album) }}
                </div>
              </div>
            </NuxtLink>
          </div>
        </section>
      </div>
    </UContextMenu>
    <nav
      v-if="showRail"
      class="hidden md:flex flex-col items-center sticky top-24 self-start py-1 glass-soft rounded-full ring ring-default"
    >
      <UButton
        v-for="item in railLetters"
        :key="item.letter"
        :label="item.letter"
        :disabled="!item.groupKey"
        :aria-label="t('collectionSort.shelf.jumpTo', { letter: item.letter })"
        variant="ghost"
        color="neutral"
        size="xs"
        class="w-7 justify-center px-0 py-0.5 text-[11px] leading-none"
        @click="jumpTo(item.groupKey)"
      />
    </nav>
    <LibraryArtistSortNameModal v-model:open="sortNameOpen" :artist="sortNameArtist" />
  </div>
</template>
