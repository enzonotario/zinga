<script lang="ts" setup>
import type { NormalizedArtist } from '~/providers/types';

defineProps<{
  artists: NormalizedArtist[]
}>();
</script>

<template>
  <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
    <NuxtLink
      v-for="artist in artists"
      :key="artist.id"
      :to="`/artist/${artist.id}`"
      class="flex flex-col items-center gap-3 p-3 rounded-lg hover:bg-accented/40 transition-colors group"
    >
      <div class="w-24 h-24 md:w-28 md:h-28 rounded-full overflow-hidden bg-accented/50 group-hover:scale-105 transition-transform">
        <img
          v-if="artist.picture"
          :src="artist.picture"
          :alt="artist.name"
          class="w-full h-full object-cover"
          loading="lazy"
        >
        <div v-else class="w-full h-full flex items-center justify-center">
          <UIcon name="i-heroicons-user" class="w-10 h-10 text-neutral-400" />
        </div>
      </div>
      <span class="text-sm font-medium text-center truncate w-full">
        {{ artist.name }}
      </span>
    </NuxtLink>
    <slot name="append" />
  </div>
</template>
