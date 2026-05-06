<script setup lang="ts">
import { computed, ref } from 'vue';
import useBottomBar from '~/composables/useBottomBar';
import useDevices from '~/composables/useDevices';
import useFeedSync from '~/composables/useFeedSync';
import useMopidyPolling from '~/composables/useMopidyPolling';
import usePlayer from '~/composables/usePlayer';
import useTerminalPanel from '~/composables/useTerminalPanel';
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
} = useBottomBar();
const { selectedDeviceId, volume } = useDevices();
const player = usePlayer();
const terminalPanel = useTerminalPanel();
const { mopidy, refresh: refreshMopidy } = useMopidyPolling();
const feedSync = useFeedSync();
async function clearQueue() {
  try {
    await player.clear();
  } catch (err) {
    console.error('Error clearing queue:', err);
  }
}
const isPlaying = computed(() => player.isPlaying.value);
const formattedPosition = computed(() => {
  const posSeconds = mopidy.position.value / 1000;
  return formatTime(posSeconds);
});
const formattedDuration = computed(() => {
  if (mopidy.currentTrack.value?.track) {
    const durationSeconds = (mopidy.currentTrack.value.track.length || 0) / 1000;
    return formatTime(durationSeconds);
  }
  return '00:00';
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
const { t } = useI18n();
const queuePopoverOpen = ref(false);
async function onQueuePopoverOpen() {
  await refreshMopidy();
}
</script>

<template>
  <div class="border-t border-neutral-200 dark:border-neutral-800 bg-(--ui-bg)/80 shadow-lg">
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
          :selected-device-id="selectedDeviceId"
          :has-track="hasTrack"
          class="py-3"
          @previous="handlePrevious"
          @toggle-play-pause="handleTogglePlayPause"
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
          @update:open="(open) => open && onQueuePopoverOpen()"
        >
          <UButton
            icon="i-heroicons-queue-list"
            variant="ghost"
            size="sm"
          >
            <UBadge
              v-if="mopidy.tracklist.value?.length"
              :label="String(mopidy.tracklist.value.length)"
              size="xs"
              class="ml-1"
            />
          </UButton>
          <template #content>
            <div class="flex flex-col max-h-96 w-80 overflow-hidden">
              <div class="flex items-center justify-between p-3 border-b border-neutral-200 dark:border-neutral-700 shrink-0">
                <div class="flex items-center gap-2 min-w-0">
                  <UIcon name="i-heroicons-queue-list" class="w-5 h-5 text-primary shrink-0" />
                  <span class="font-semibold">{{ t('nav.queue') }}</span>
                  <span class="text-sm text-muted">({{ mopidy.tracklist.value?.length || 0 }})</span>
                </div>
                <div class="flex items-center gap-1">
                  <UButton
                    v-if="mopidy.tracklist.value?.length"
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
              <div v-if="mopidy.tracklist.value?.length" class="p-2 border-t border-neutral-200 dark:border-neutral-700 shrink-0">
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
        <UButton
          v-if="terminalPanel.hasSession.value"
          icon="i-heroicons-command-line"
          variant="ghost"
          size="sm"
          :color="terminalPanel.isVisible.value ? 'primary' : 'neutral'"
          :aria-label="terminalPanel.isVisible.value ? t('terminal.minimize') : t('terminal.open')"
          @click="terminalPanel.toggle()"
        />
        <div class="hidden md:flex items-center gap-2 min-w-0">
          <DeviceSelector />
        </div>
        <div class="py-2 h-full">
          <UiVolumeControl
            :volume="volume"
            :selected-device-id="selectedDeviceId"
            @update:volume="handleVolumeChange"
            @decrease="decreaseVolume"
            @increase="increaseVolume"
            @pause-polling="pauseVolumePolling"
            @resume-polling="resumeVolumePolling"
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
