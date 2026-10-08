<script setup lang="ts">
import { computed, ref } from 'vue';
import useBottomBar from '~/composables/useBottomBar';
import useDevices from '~/composables/useDevices';
import useFeedSync from '~/composables/useFeedSync';
import usePlayer from '~/composables/usePlayer';
import usePlayQueue from '~/composables/usePlayQueue';
import { formatTime } from '~/utils/time';
import QueueList from '../Queue/QueueList.vue';
import DeviceSelector from '../Upnp/DeviceSelector.vue';
import PlaybackControls from './PlaybackControls.vue';
import TimeDisplay from './TimeDisplay.vue';
import TrackInfo from './TrackInfo.vue';
import TrackProgress from './TrackProgress.vue';

const {
  currentTrack,
  hasTrack,
  progress: playbackProgress,
  handleProgressChange,
  handleVolumeChange,
  decreaseVolume,
  increaseVolume,
  pauseVolumePolling,
  resumeVolumePolling,
  syncVolumeFromDevice,
  isVolumeSyncing,
} = useBottomBar();
const { selectedDeviceId, volume } = useDevices();
const player = usePlayer();
const queue = usePlayQueue();
const feedSync = useFeedSync();
async function clearQueue() {
  try {
    await player.clear();
  } catch (err) {
    console.error('Error clearing queue:', err);
  }
}
const isPlaying = computed(() => player.isPlaying.value);
const pauseAtEndOfTrack = computed(() => player.pauseAtEndOfTrack.value);
const formattedPosition = computed(() => {
  return formatTime(currentTrack.value?.position ?? 0);
});
const formattedDuration = computed(() => {
  if (!player.currentItem.value) return '00:00';
  return formatTime(player.duration.value);
});
const handleTogglePlayPause = async () => {
  await player.togglePlayPause();
};
const handleNext = async () => {
  await player.next();
};
const handlePrevious = async () => {
  await player.previous();
};
const handleTogglePauseAtEnd = () => {
  player.togglePauseAtEndOfTrack();
};
const { t } = useI18n();
const queuePopoverOpen = ref(false);
</script>

<template>
  <div class="glass border-t border-default">
    <div class="grid grid-cols-3 px-4 gap-4">
      <div class="flex flex-col min-w-0">
        <TrackProgress
          :progress="playbackProgress"
          :disabled="!hasTrack"
          class="px-0!"
          @update:progress="handleProgressChange"
        />
        <div class="flex flex-row items-center">
          <TrackInfo :track="currentTrack" class="py-2" />
          <TimeDisplay
            :position="formattedPosition"
            :duration="formattedDuration"
            :has-track="hasTrack"
          />
        </div>
      </div>
      <div class="flex flex-row justify-center items-center">
        <PlaybackControls
          :is-playing="isPlaying"
          :pause-at-end-of-track="pauseAtEndOfTrack"
          :selected-device-id="selectedDeviceId"
          :has-track="hasTrack"
          class="py-3"
          @previous="handlePrevious"
          @toggle-play-pause="handleTogglePlayPause"
          @toggle-pause-at-end="handleTogglePauseAtEnd"
          @next="handleNext"
        />
      </div>
      <div class="flex items-center gap-4 min-w-0 justify-end">
        <UPopover
          v-if="feedSync.isSyncing.value"
          :content="{ side: 'top', align: 'end', sideOffset: 8 }"
          :ui="{ content: 'w-72 p-4' }"
        >
          <UButton
            icon="i-heroicons-arrow-path"
            variant="ghost"
            size="sm"
            color="primary"
            class="animate-spin"
          />
          <template #content>
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between gap-2">
                <span class="text-sm font-medium">{{ t('pages.feed.syncing') }}</span>
                <span v-if="feedSync.progress.value.page" class="text-xs text-muted">
                  {{ t('pages.library.pageProgress', { page: feedSync.progress.value.page }) }}
                </span>
              </div>
              <p class="text-xs text-muted truncate">
                {{ feedSync.progress.value.message }}
              </p>
              <UProgress
                :value="feedSync.progress.value.total > 0 ? feedSync.progress.value.current : undefined"
                :max="feedSync.progress.value.total > 0 ? feedSync.progress.value.total : undefined"
                size="xs"
                color="primary"
              />
            </div>
          </template>
        </UPopover>
        <UPopover
          v-model:open="queuePopoverOpen"
          :content="{ side: 'top', align: 'end', sideOffset: 8 }"
          :ui="{ content: 'w-80 max-h-96 overflow-hidden' }"
        >
          <UButton
            icon="i-heroicons-queue-list"
            variant="ghost"
            size="sm"
          >
            <UBadge
              v-if="queue.items.value.length"
              :label="String(queue.items.value.length)"
              size="xs"
              class="ml-1"
            />
          </UButton>
          <template #content>
            <div class="flex flex-col max-h-96 w-80 overflow-hidden">
              <div class="flex items-center justify-between p-3 border-b border-default shrink-0">
                <div class="flex items-center gap-2 min-w-0">
                  <UIcon name="i-heroicons-queue-list" class="w-5 h-5 text-primary shrink-0" />
                  <span class="font-semibold">{{ t('nav.queue') }}</span>
                  <span class="text-sm text-muted">({{ queue.items.value.length }})</span>
                </div>
                <div class="flex items-center gap-1">
                  <UButton
                    v-if="queue.items.value.length"
                    icon="i-heroicons-trash"
                    variant="ghost"
                    size="xs"
                    color="error"
                    @click="clearQueue"
                  />
                  <NuxtLink to="/" @click="queuePopoverOpen = false">
                    <UButton
                      icon="i-heroicons-arrow-top-right-on-square"
                      variant="ghost"
                      size="xs"
                    />
                  </NuxtLink>
                </div>
              </div>
              <div class="overflow-y-auto flex-1 min-h-0">
                <QueueList compact :max-items="5" />
              </div>
              <div v-if="queue.items.value.length" class="p-2 border-t border-default shrink-0">
                <NuxtLink to="/" class="block" @click="queuePopoverOpen = false">
                  <UButton
                    :label="t('nav.viewFullQueue')"
                    variant="soft"
                    block
                    size="sm"
                  />
                </NuxtLink>
              </div>
            </div>
          </template>
        </UPopover>
        <div class="hidden md:flex items-center gap-2 min-w-0">
          <DeviceSelector />
        </div>
        <div class="py-2 h-full">
          <UiVolumeControl
            :volume="volume"
            :selected-device-id="selectedDeviceId"
            :syncing="isVolumeSyncing"
            @update:volume="handleVolumeChange"
            @decrease="decreaseVolume"
            @increase="increaseVolume"
            @pause-polling="pauseVolumePolling"
            @resume-polling="resumeVolumePolling"
            @sync="syncVolumeFromDevice"
          />
        </div>
      </div>
    </div>
    <USeparator class="md:hidden" />
    <div class="md:hidden px-4 pb-3 pt-2">
      <DeviceSelector />
    </div>
  </div>
</template>
