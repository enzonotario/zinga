<script lang="ts" setup>
import type { NormalizedAlbum } from '~/providers/types';

defineProps<{
  albums: NormalizedAlbum[]
}>();
</script>

<template>
  <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
    <NuxtLink
      v-for="album in albums"
      :key="album.id"
      :to="`/album/${album.id}`"
      class="flex flex-col gap-2 p-3 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors group"
    >
      <div class="relative aspect-square w-full rounded-lg overflow-hidden bg-neutral-200 dark:bg-neutral-800">
        <img
          v-if="album.coverUrl"
          :src="album.coverUrl"
          :alt="album.title"
          class="w-full h-full object-cover group-hover:scale-105 transition-transform"
          loading="lazy"
        >
        <div v-else class="w-full h-full flex items-center justify-center">
          <UIcon name="i-heroicons-musical-note" class="w-12 h-12 text-neutral-400" />
        </div>
      </div>
      <div class="min-h-0 space-y-1">
        <div class="font-medium text-sm truncate" :title="album.title">
          {{ album.title }}
        </div>
        <div class="text-xs text-(--ui-text-muted) truncate">
          {{ album.artists.map(a => a.name).join(', ') }}
        </div>
        <div v-if="album.releaseDate" class="text-xs text-(--ui-text-muted)">
          {{ new Date(album.releaseDate).getFullYear() }}
        </div>
      </div>
    </NuxtLink>
    <slot name="append" />
  </div>
</template>
