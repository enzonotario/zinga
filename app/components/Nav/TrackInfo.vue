<script setup lang="ts">
import type { TrackInfo } from '~/types/track';
import { computed } from 'vue';

interface Props {
  track: TrackInfo | null
}
const props = defineProps<Props>();
const hasTrack = computed(() => props.track !== null);
</script>

<template>
  <div class="flex items-center gap-3 min-w-0 flex-1">
    <UAvatar
      v-if="track?.coverUrl"
      :src="track.coverUrl"
      :alt="track.title"
      size="md"
      class="flex-shrink-0"
    />
    <UAvatar
      v-else-if="hasTrack"
      icon="i-heroicons-musical-note"
      size="md"
      class="flex-shrink-0"
    />
    <div v-if="hasTrack" class="min-w-0 flex-1">
      <div class="text-sm font-medium truncate">
        {{ track?.title || $t('player.unknownTitle') }}
      </div>
      <div class="text-xs text-gray-500 dark:text-gray-400 truncate">
        {{ track?.artist || $t('player.unknownArtist') }} • {{ track?.album || $t('player.unknownAlbum') }}
      </div>
    </div>
    <div v-else class="text-sm text-gray-500 dark:text-gray-400">
      {{ $t('player.noPlayback') }}
    </div>
  </div>
</template>
