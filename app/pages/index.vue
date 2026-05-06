<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import LyricsPanelBody from '~/components/Player/LyricsPanelBody.vue';
import LyricsPanelFloatingCard from '~/components/Player/LyricsPanelFloatingCard.vue';
import LyricsPanelFullscreenCard from '~/components/Player/LyricsPanelFullscreenCard.vue';
import LyricsPanelToolbar from '~/components/Player/LyricsPanelToolbar.vue';
import QueueList from '~/components/Queue/QueueList.vue';
import useBottomBar from '~/composables/useBottomBar';
import useLyrics from '~/composables/useLyrics';
import useLyricsFontSize from '~/composables/useLyricsFontSize';
import useLyricsPanelMode from '~/composables/useLyricsPanelMode';
import useMopidyPolling from '~/composables/useMopidyPolling';
import usePlayer from '~/composables/usePlayer';
import useProviderNavigation from '~/composables/useProviderNavigation';
import { getCurrentProvider } from '~/providers';

const { t } = useI18n();

definePageMeta({
  fixedLayout: true,
});
const { currentTrack, isUsingMopidy, progress } = useBottomBar();
const { mopidy } = useMopidyPolling();
const player = usePlayer();
const { albumRoute } = useProviderNavigation();
const lyricsState = useLyrics();
const {
  lyricsFontSizePx,
  lyricsFontMinPx,
  lyricsFontMaxPx,
  bumpLyricsFontSize,
  applyLyricsFontInput,
  registerLyricsWheelScroll,
  lyricsBodyStyle,
} = useLyricsFontSize();
const { lyricsPanelMode } = useLyricsPanelMode();
const provider = getCurrentProvider();
const isPlaying = computed(() => player.isPlaying.value);
const tidalAlbum = computed(() => {
  const album = currentTrack.value?.tidalData?.album;
  if (album) {
    if (album.data && album.included) {
      const albumData = {
        ...album.data,
        included: album.included,
      };
      if (album.data.relationships) {
        albumData.relationships = album.data.relationships;
      }
      return albumData;
    }
    if (album.included) {
      return album;
    }
    return album;
  }
  const track = currentTrack.value?.tidalData?.track;
  if (track?.included) {
    const albumRef = track.relationships?.albums?.data?.[0];
    if (albumRef) {
      const albumIncluded = track.included.find(
        (item: any) => item.type === 'albums' && item.id === albumRef.id,
      );
      if (albumIncluded) {
        const artworkInTrackIncluded = track.included.find((item: any) => item.type === 'artworks');
        if (artworkInTrackIncluded) {
          return {
            ...albumIncluded,
            relationships: {
              ...albumIncluded.relationships,
              coverArt: {
                ...(albumIncluded.relationships?.coverArt || {}),
                data: [{ id: artworkInTrackIncluded.id, type: 'artworks' }],
              },
            },
            included: track.included,
          };
        }
        return {
          ...albumIncluded,
          included: track.included,
        };
      }
    }
  }
  return undefined;
});
const tidalArtist = computed(() => {
  const artist = currentTrack.value?.tidalData?.artist;
  if (artist) {
    if (artist.data && artist.included) {
      return {
        ...artist.data,
        included: artist.included,
      };
    }
    if (artist.included) {
      return artist;
    }
    return artist;
  }
  const track = currentTrack.value?.tidalData?.track;
  if (track?.included) {
    const artistRef = track.relationships?.artists?.data?.[0];
    if (artistRef) {
      const artistIncluded = track.included.find(
        (item: any) => item.type === 'artists' && item.id === artistRef.id,
      );
      if (artistIncluded) {
        const artworkInTrackIncluded = track.included.find((item: any) => item.type === 'artworks');
        if (artworkInTrackIncluded) {
          return {
            ...artistIncluded,
            relationships: {
              ...artistIncluded.relationships,
              profileArt: {
                ...(artistIncluded.relationships?.profileArt || {}),
                data: [{ id: artworkInTrackIncluded.id, type: 'artworks' }],
              },
            },
            included: track.included,
          };
        }
        return {
          ...artistIncluded,
          included: track.included,
        };
      }
    }
  }
  return undefined;
});
const albumTitle = computed(() => tidalAlbum.value?.attributes?.title || currentTrack.value?.album);
const albumReleaseDate = computed(() => tidalAlbum.value?.attributes?.releaseDate || (currentTrack.value as any)?.date);
const albumNumberOfItems = computed(() => tidalAlbum.value?.attributes?.numberOfItems);
const tidalTrack = computed(() => currentTrack.value?.tidalData?.track);
const albumInlineCredits = computed(() => {
  const album = tidalAlbum.value?.attributes ?? (tidalAlbum.value as any)?.attributes;
  const trackAttrs = tidalTrack.value?.attributes ?? (tidalTrack.value as any)?.data?.attributes;
  const releaseDate = album?.releaseDate;
  const copyright = trackAttrs?.copyright?.text ?? (trackAttrs?.copyright as string) ?? album?.copyright;
  const mediaTags = album?.mediaTags ?? trackAttrs?.mediaTags ?? [];
  if (!releaseDate && !copyright && mediaTags.length === 0) return null;
  return { releaseDate, copyright, mediaTags: mediaTags.length ? mediaTags : undefined };
});
const trackNumber = computed(() => (currentTrack.value as any)?.trackNumber);
function getMopidyCurrentTrackIndex(): number {
  const currentTlid = mopidy.currentTrack.value?.tlid;
  if (currentTlid && mopidy.tracklist.value?.length) {
    const index = mopidy.tracklist.value.findIndex((t: any) => t.tlid === currentTlid);
    if (index !== -1) return index + 1;
  }
  return 0;
}
const vinylTrackCount = computed(() => {
  const mopidyLen = mopidy.tracklist.value?.length ?? 0;
  if (isUsingMopidy.value) return mopidyLen;
  return albumNumberOfItems.value || mopidyLen || 0;
});
const vinylCurrentTrackNumber = computed(() => {
  if (isUsingMopidy.value) return getMopidyCurrentTrackIndex();
  const mopidyLen = mopidy.tracklist.value?.length ?? 0;
  if (mopidyLen > 0) return getMopidyCurrentTrackIndex();
  return trackNumber.value || 0;
});
const artistName = computed(() => tidalArtist.value?.attributes?.name || currentTrack.value?.artist);
const asyncAlbumCover = ref<string | null>(null);
const lastLoadedAlbumId = ref<string | null>(null);
watch(
  () => tidalAlbum.value,
  async (album) => {
    if (!album) {
      asyncAlbumCover.value = null;
      lastLoadedAlbumId.value = null;
      return;
    }
    const albumId = album.id || album.data?.id;
    if (albumId && albumId === lastLoadedAlbumId.value) {
      return;
    }
    if (!albumId) {
      return;
    }
    try {
      const cover = await provider.getAlbumCover(albumId);
      if (cover) {
        asyncAlbumCover.value = cover;
        lastLoadedAlbumId.value = albumId;
      }
    } catch (error) {
      console.warn('Error cargando portada del álbum:', error);
    }
  },
  { immediate: true },
);
const albumCover = computed(() => {
  if (asyncAlbumCover.value) return asyncAlbumCover.value;
  return currentTrack.value?.coverUrl || null;
});
const currentTrackTitle = computed(() => currentTrack.value?.title || '');
const currentTrackArtist = computed(() => currentTrack.value?.artist || '');
const lyricsCurrentTimeSec = computed(() => currentTrack.value?.position ?? 0);
const lyricsToolbarTrackTitle = computed(() => currentTrack.value?.title?.trim() || t('player.noTrack'));
const lyricsIdleNoTrack = computed(() => !currentTrack.value);
const showLyricsPanel = computed(() => lyricsPanelMode.value === 'fullscreen');
const showFloatingLyrics = computed(() => lyricsPanelMode.value === 'floating');
const showDockedLyricsToggle = computed(() => lyricsPanelMode.value === 'docked');
const pageGridClass = computed(() => {
  if (showLyricsPanel.value) {
    return 'flex-1 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)] gap-4 md:min-h-0 md:min-w-0 md:overflow-hidden';
  }
  return 'flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 md:min-h-0 md:min-w-0 md:overflow-hidden';
});
watch(
  () => [currentTrackTitle.value, currentTrackArtist.value],
  async ([title, artist]) => {
    if (!title || !artist) {
      lyricsState.clearLyrics();
      return;
    }
    await lyricsState.fetchLyrics(title, artist);
  },
  { immediate: true },
);
</script>

<template>
  <div class="md:h-full flex flex-col md:overflow-hidden relative">
    <div :class="pageGridClass">
      <div class="px-[10%] 2xl:px-[15%] md:flex-1 md:min-h-0 flex flex-col justify-center items-center gap-3 overflow-y-auto">
        <NowPlayingDisplay
          :cover-url="albumCover || currentTrack?.coverUrl || undefined"
          :alt="albumTitle || currentTrack?.title"
          :title="albumTitle"
          :title-link="albumRoute || undefined"
          class="pt-20"
        />
        <UiTrackCredits
          v-if="albumInlineCredits"
          :inline-credits="albumInlineCredits"
        />
      </div>
      <div class="flex flex-col gap-4 md:min-h-0 md:min-w-0 overflow-visible py-2">
        <UCard
          class="shrink-0 md:max-h-[40%] max-h-[60vh] overflow-hidden flex flex-col z-10"
          :ui="{ body: 'p-0! flex-1 overflow-hidden' }"
        >
          <QueueList class="max-h-full" />
        </UCard>
        <div class="md:flex-1 md:min-h-0 min-w-0 w-full flex items-center justify-center py-4 md:py-0 px-1 md:px-2 -mt-[15vh]">
          <PlayerVinylPlayer
            :cover-url="albumCover || currentTrack?.coverUrl || undefined"
            :title="albumTitle"
            :artist="artistName"
            :year="albumReleaseDate"
            :is-playing="isPlaying"
            :progress="progress"
            :track-count="vinylTrackCount"
            :current-track-number="vinylCurrentTrackNumber"
          />
        </div>
      </div>
      <LyricsPanelFullscreenCard v-if="showLyricsPanel">
        <template #header>
          <LyricsPanelToolbar
            :track-title="lyricsToolbarTrackTitle"
            :provider="lyricsState.provider.value ?? null"
            :lyrics-font-size-px="lyricsFontSizePx"
            :lyrics-font-min-px="lyricsFontMinPx"
            :lyrics-font-max-px="lyricsFontMaxPx"
            @bump-font="bumpLyricsFontSize"
            @apply-font-input="applyLyricsFontInput"
          >
            <template #actions>
              <UButton
                icon="i-heroicons-arrows-pointing-in"
                variant="ghost"
                color="neutral"
                size="xs"
                :aria-label="t('player.minimizeLyrics')"
                @click="lyricsPanelMode = 'floating'"
              />
            </template>
          </LyricsPanelToolbar>
        </template>

        <LyricsPanelBody
          :loading="lyricsState.loading.value"
          :error="lyricsState.error.value"
          :plain-lyrics="lyricsState.lyrics.value"
          :synced-lrc="lyricsState.syncedLyrics.value"
          :current-time-sec="lyricsCurrentTimeSec"
          :lyrics-body-style="lyricsBodyStyle"
          :register-lyrics-wheel-scroll="registerLyricsWheelScroll"
          :idle-no-track="lyricsIdleNoTrack"
          layout="fullscreen"
        />
      </LyricsPanelFullscreenCard>
    </div>
    <LyricsPanelFloatingCard v-if="showFloatingLyrics">
      <template #header>
        <LyricsPanelToolbar
          :track-title="lyricsToolbarTrackTitle"
          :provider="lyricsState.provider.value ?? null"
          :lyrics-font-size-px="lyricsFontSizePx"
          :lyrics-font-min-px="lyricsFontMinPx"
          :lyrics-font-max-px="lyricsFontMaxPx"
          @bump-font="bumpLyricsFontSize"
          @apply-font-input="applyLyricsFontInput"
        >
          <template #actions>
            <UButton
              icon="i-heroicons-arrows-pointing-out"
              variant="ghost"
              color="neutral"
              size="xs"
              :aria-label="t('player.expandLyrics')"
              @click="lyricsPanelMode = 'fullscreen'"
            />
            <UButton
              icon="i-heroicons-chevron-down"
              variant="ghost"
              color="neutral"
              size="xs"
              :aria-label="t('player.hideLyrics')"
              @click="lyricsPanelMode = 'docked'"
            />
          </template>
        </LyricsPanelToolbar>
      </template>
      <LyricsPanelBody
        :loading="lyricsState.loading.value"
        :error="lyricsState.error.value"
        :plain-lyrics="lyricsState.lyrics.value"
        :synced-lrc="lyricsState.syncedLyrics.value"
        :current-time-sec="lyricsCurrentTimeSec"
        :lyrics-body-style="lyricsBodyStyle"
        :register-lyrics-wheel-scroll="registerLyricsWheelScroll"
        :idle-no-track="lyricsIdleNoTrack"
        layout="floating"
      />
    </LyricsPanelFloatingCard>
    <UButton
      v-if="showDockedLyricsToggle"
      icon="i-heroicons-musical-note"
      color="neutral"
      variant="soft"
      size="sm"
      class="fixed right-4 bottom-24 md:right-6 md:bottom-24 z-30 shadow-lg"
      :aria-label="t('player.showLyrics')"
      @click="lyricsPanelMode = 'floating'"
    >
      {{ t('lyrics.lyrics') }}
    </UButton>
  </div>
</template>
