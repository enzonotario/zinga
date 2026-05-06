<script lang="ts" setup>
import type { AccordionItem } from '@nuxt/ui';
import type { NormalizedCredit } from '~/providers/types';
import { computed, nextTick, ref, watch } from 'vue';
import useBottomBar from '~/composables/useBottomBar';
import useMopidyPolling from '~/composables/useMopidyPolling';
import useProvider from '~/composables/useProvider';
import useQueueProgress from '~/composables/useQueueProgress';
import useTidalArtwork from '~/composables/useTidalArtwork';
import useTidalAuth from '~/composables/useTidalAuth';
import { extractTidalIdsFromUri } from '~/utils/tidal';
import { fetchTidalMetadata } from '~/utils/tidalMetadata';
import { formatTime } from '~/utils/time';

interface Props {
  compact?: boolean
  maxItems?: number
}
const props = withDefaults(defineProps<Props>(), {
  compact: false,
  maxItems: 0,
});
const { t } = useI18n();
const { mopidy } = useMopidyPolling();
const {
  totalDuration,
  progressPercentage,
  formattedCurrentProgress,
  formattedTotalDuration,
  formattedRemainingDuration,
} = useQueueProgress(mopidy);
useBottomBar();
const provider = useProvider();
const tidalArtwork = useTidalArtwork();
const tidalAuth = useTidalAuth();
const scrollContainer = ref<HTMLElement | null>(null);
const activeAccordionValue = ref<string | undefined>(undefined);
const shouldAutoScroll = ref(false);
interface TrackCreditsData {
  loading: boolean
  inlineCredits?: {
    releaseDate?: string
    copyright?: string
    isrc?: string
    mediaTags?: string[]
  }
  creditsByRole?: Record<string, string[]>
}
const trackCreditsByTlid = ref<Record<string, TrackCreditsData>>({});
function groupCreditsByRole(credits: NormalizedCredit[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const credit of credits) {
    const role = credit.role || t('artist.other');
    if (!grouped[role]) grouped[role] = [];
    if (credit.name && !grouped[role].includes(credit.name)) {
      grouped[role].push(credit.name);
    }
  }
  return grouped;
}
async function loadTrackCredits(tlid: number, uri: string) {
  const key = String(tlid);
  if (trackCreditsByTlid.value[key]?.inlineCredits !== undefined || trackCreditsByTlid.value[key]?.creditsByRole !== undefined) return;
  if (trackCreditsByTlid.value[key]?.loading) return;
  trackCreditsByTlid.value[key] = { loading: true };
  trackCreditsByTlid.value = { ...trackCreditsByTlid.value };
  const { trackId } = extractTidalIdsFromUri(uri);
  try {
    const [metadata, credits] = await Promise.all([
      fetchTidalMetadata(uri, tidalArtwork, tidalAuth),
      trackId ? provider.getTrackCredits(trackId) : Promise.resolve([]),
    ]);
    const trackData = metadata?.track;
    const attrs = trackData?.attributes ?? (trackData as any)?.attributes;
    const releaseDate = attrs?.releaseDate ?? metadata?.album?.data?.attributes?.releaseDate ?? (metadata?.album as any)?.attributes?.releaseDate;
    const copyright = attrs?.copyright?.text ?? (attrs?.copyright as string);
    const isrc = attrs?.isrc;
    const mediaTags = attrs?.mediaTags ?? [];
    trackCreditsByTlid.value[key] = {
      loading: false,
      inlineCredits: (releaseDate || copyright || isrc || mediaTags.length > 0)
        ? { releaseDate, copyright, isrc, mediaTags }
        : undefined,
      creditsByRole: credits.length > 0 ? groupCreditsByRole(credits) : undefined,
    };
  } catch (err) {
    console.error('Error loading track credits:', err);
    trackCreditsByTlid.value[key] = { loading: false };
  }
  trackCreditsByTlid.value = { ...trackCreditsByTlid.value };
}
function getTrackCreditsForItem(item: any): TrackCreditsData | undefined {
  return trackCreditsByTlid.value[item.value];
}
const currentTrackTlid = computed(() => mopidy.currentTrack.value?.tlid);
const displayedTracks = computed(() => {
  const tracks = (mopidy.tracklist.value || []).filter((t: any) => t && t.tlid !== undefined && t.track && (t.track.name || t.track.uri));
  return props.maxItems > 0 && tracks.length > props.maxItems ? tracks.slice(0, props.maxItems) : tracks;
});
const validTracksCount = computed(() => (mopidy.tracklist.value || []).filter((t: any) => t && t.tlid !== undefined && t.track && (t.track.name || t.track.uri)).length);
const hasMoreTracks = computed(() => props.maxItems > 0 && validTracksCount.value > props.maxItems);
const remainingTracksCount = computed(() => props.maxItems > 0 ? validTracksCount.value - props.maxItems : 0);
const accordionItems = computed<AccordionItem[]>(() => {
  return displayedTracks.value.map((tlTrack: any, index: number) => {
    const isCurrentTrack = currentTrackTlid.value === tlTrack.tlid;
    return {
      value: String(tlTrack.tlid),
      label: tlTrack.track?.name || t('player.unknownTrack'),
      icon: isCurrentTrack ? (mopidy.isPlaying.value ? 'i-heroicons-play-solid' : 'i-heroicons-pause-solid') : undefined,
      tlTrack,
      index,
      artistName: tlTrack.track?.artists?.map((a: any) => a.name).join(', ') || t('player.unknownArtist'),
      duration: tlTrack.track?.length ? formatTime(tlTrack.track.length / 1000) : '--:--',
      isCurrentTrack,
    };
  });
});
watch(activeAccordionValue, (newValue) => {
  if (!newValue) return;
  const item = accordionItems.value.find((i: any) => i.value === newValue);
  const uri = item?.tlTrack?.track?.uri;
  if (item?.tlTrack && uri) loadTrackCredits(item.tlTrack.tlid, uri);
});
watch(displayedTracks, (tracks) => {
  for (const tlTrack of tracks as any[]) {
    const uri = tlTrack?.track?.uri;
    if (uri && tlTrack?.tlid !== undefined) loadTrackCredits(tlTrack.tlid, uri);
  }
}, { immediate: true });
watch(currentTrackTlid, (newTlid) => {
  if (newTlid !== undefined) {
    shouldAutoScroll.value = true;
    activeAccordionValue.value = String(newTlid);
  }
}, { immediate: true });
watch(activeAccordionValue, async (newValue) => {
  if (!shouldAutoScroll.value || !newValue || !scrollContainer.value) return;
  shouldAutoScroll.value = false;
  await nextTick();
  setTimeout(() => {
    if (!scrollContainer.value) return;
    const openItem = scrollContainer.value.querySelector('[data-state="open"]') as HTMLElement;
    if (!openItem) return;
    const itemContainer = openItem.closest('.border-b') || openItem.parentElement;
    if (!itemContainer) return;
    const containerRect = scrollContainer.value.getBoundingClientRect();
    const itemRect = itemContainer.getBoundingClientRect();
    const offsetTop = itemRect.top - containerRect.top + scrollContainer.value.scrollTop;
    scrollContainer.value.scrollTo({ top: offsetTop, behavior: 'smooth' });
  }, 150);
});
async function playTrack(tlid: number) {
  try {
    await mopidy.mopidyRpc('core.playback.play', { tlid });
    await mopidy.refreshState();
  } catch (err) {
    console.error('Error playing track:', err);
  }
}
async function removeTrack(tlid: number) {
  try {
    await mopidy.mopidyRpc('core.tracklist.remove', { criteria: { tlid: [tlid] } });
    await mopidy.getTracklist();
  } catch (err) {
    console.error('Error removing track:', err);
  }
}
async function clearQueue() {
  try {
    await mopidy.clear();
  } catch (err) {
    console.error('Error clearing queue:', err);
  }
}
</script>

<template>
  <div class="queue-list h-full flex flex-col overflow-hidden min-w-0">
    <div v-if="!displayedTracks.length" class="text-center py-8 text-muted flex flex-col items-center gap-2">
      <UIcon name="i-heroicons-queue-list" class="w-12 h-12 opacity-50" />
      <p>{{ $t('queue.empty') }}</p>
    </div>
    <div v-else class="flex flex-col h-full overflow-hidden">
      <div v-if="!compact" class="flex flex-col gap-2 pt-2">
        <div class="flex items-center justify-between px-2 shrink-0">
          <span class="text-xs font-medium text-muted uppercase tracking-wider px-2">
            {{ $t('pages.queue.songCount', { count: validTracksCount }) }}
          </span>
          <UButton
            :label="$t('pages.queue.clearQueue')"
            icon="i-heroicons-trash"
            size="xs"
            variant="ghost"
            color="error"
            @click="clearQueue"
          />
        </div>
        <div v-if="totalDuration > 0" class="shrink-0">
          <div class="px-4 flex justify-between text-[10px] font-medium text-muted uppercase tracking-wider">
            <span>{{ formattedCurrentProgress }}</span>
            <span>-{{ formattedRemainingDuration }}</span>
            <span>{{ formattedTotalDuration }}</span>
          </div>
          <UProgress
            v-model="progressPercentage"
            size="xs"
          />
        </div>
      </div>
      <div
        ref="scrollContainer"
        class="overflow-y-auto overflow-x-hidden flex-1 scroll-smooth"
      >
        <UAccordion
          v-model="activeAccordionValue"
          :items="accordionItems"
          :unmount-on-hide="false"
          :ui="{
            root: 'overflow-hidden',
            trigger: 'py-2 px-1 overflow-hidden',
            label: 'w-full min-w-0 overflow-hidden',
          }"
        >
          <template #leading="{ item }">
            <div class="w-6 text-center shrink-0">
              <UIcon
                v-if="(item as any).isCurrentTrack && mopidy.isPlaying.value"
                name="i-heroicons-play-solid"
                class="w-4 h-4 text-primary animate-pulse"
              />
              <UIcon
                v-else-if="(item as any).isCurrentTrack && mopidy.isPaused.value"
                name="i-heroicons-pause-solid"
                class="w-4 h-4 text-primary"
              />
              <span v-else class="text-sm text-muted">
                {{ (item as any).index + 1 }}
              </span>
            </div>
          </template>
          <template #default="{ item }">
            <div class="flex items-center gap-2 flex-1 min-w-0">
              <div class="flex-1 min-w-0">
                <div
                  class="font-medium truncate text-sm" :class="[
                    (item as any).isCurrentTrack ? 'text-primary' : '',
                  ]"
                >
                  {{ item.label }}
                </div>
                <div v-if="!compact" class="text-xs text-muted truncate">
                  <template v-if="getTrackCreditsForItem((item as any))?.loading">
                    <USkeleton class="h-3 w-20 inline-block" />
                  </template>
                  <template v-else-if="getTrackCreditsForItem((item as any))?.creditsByRole?.Composer?.length">
                    {{ getTrackCreditsForItem((item as any))?.creditsByRole?.Composer?.join(', ') }}
                  </template>
                  <span v-else>{{ (item as any).artistName }}</span>
                </div>
              </div>
              <span v-if="compact" class="text-xs text-muted shrink-0">
                {{ (item as any).duration }}
              </span>
              <UBadge
                v-else
                :label="(item as any).duration"
                leading-icon="i-heroicons-clock"
                variant="soft"
                size="sm"
                class="shrink-0"
              />
            </div>
          </template>
          <template #body="{ item }">
            <div class="px-3 space-y-3 overflow-hidden">
              <UiTrackCredits
                v-if="!compact"
                :loading="!getTrackCreditsForItem((item as any)) || getTrackCreditsForItem((item as any))?.loading"
                :credits-by-role="getTrackCreditsForItem((item as any))?.creditsByRole"
              />
              <div class="flex items-center gap-2 flex-wrap">
                <UButton
                  v-if="!(item as any).isCurrentTrack"
                  icon="i-heroicons-play"
                  :label="compact ? undefined : $t('queue.play')"
                  size="xs"
                  @click="playTrack((item as any).tlTrack.tlid)"
                />
                <UButton
                  v-else
                  icon="i-heroicons-speaker-wave"
                  :label="compact ? undefined : $t('queue.playing')"
                  size="xs"
                  variant="soft"
                  disabled
                />
                <UButton
                  icon="i-heroicons-trash"
                  :label="compact ? undefined : $t('queue.remove')"
                  size="xs"
                  color="error"
                  variant="ghost"
                  @click="removeTrack((item as any).tlTrack.tlid)"
                />
              </div>
            </div>
          </template>
        </UAccordion>
        <div class="h-[60%]" aria-hidden="true" />
      </div>
    </div>
    <div v-if="hasMoreTracks" class="text-center py-2 text-sm text-muted">
      {{ $t('common.more', { count: remainingTracksCount }) }}
    </div>
  </div>
</template>
