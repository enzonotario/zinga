<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import VinylPlayer from '~/components/Player/VinylPlayer.vue';

definePageMeta({
  name: 'debug-vinyl',
  nameKey: 'pages.debugVinyl.name',
  icon: 'lucide:bug',
  category: 'debug',
  descriptionKey: 'pages.debugVinyl.description',
});
const { t } = useI18n();
const isPlaying = ref(false);
const progress = ref(0);
const trackCount = ref(9);
const currentTrackNumber = ref(3);
const coverUrl = ref('');
const title = ref('Abbey Road');
const artist = ref('The Beatles');
const year = ref(1969);
const previewBoxPx = ref(440);
const plinthMaxPx = ref(360);
const previewFrameStyle = computed(() => ({
  width: `${previewBoxPx.value}px`,
  height: `${previewBoxPx.value}px`,
  maxWidth: '100%',
  minWidth: '200px',
  minHeight: '200px',
}));
function clampPreview(n: number) {
  return Math.min(720, Math.max(200, Math.round(n)));
}
function clampPlinthMax(n: number) {
  return Math.min(520, Math.max(240, Math.round(n)));
}
watch(previewBoxPx, (v) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return;
  const c = clampPreview(v);
  if (c !== v) previewBoxPx.value = c;
});
watch(plinthMaxPx, (v) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return;
  const c = clampPlinthMax(v);
  if (c !== v) plinthMaxPx.value = c;
});
const handleProgressChange = (value: number) => {
  progress.value = value;
};
const handleTrackCountChange = (value: number) => {
  trackCount.value = value;
  if (currentTrackNumber.value > value) {
    currentTrackNumber.value = value;
  }
};
const handleCurrentTrackChange = (value: number) => {
  if (value > 0 && value <= trackCount.value) {
    currentTrackNumber.value = value;
  }
};
</script>

<template>
  <UContainer class="py-6 flex flex-col gap-6">
    <UCard>
      <template #header>
        <h2 class="text-xl font-semibold">
          {{ t('pages.debugVinyl.title') }}
        </h2>
      </template>
      <div class="space-y-6">
        {{ t('pages.debugVinyl.adjustParams') }}
      </div>
    </UCard>
    <div class="grid grid-cols-1 lg:grid-cols-2 items-start gap-6">
      <UCard>
        <template #header>
          <h2 class="text-xl font-semibold">
            {{ t('pages.debugVinyl.controls') }}
          </h2>
        </template>
        <div class="space-y-6">
          <UFormField :label="t('pages.debugVinyl.playbackState')">
            <div class="flex gap-2">
              <UButton
                :variant="isPlaying ? 'solid' : 'outline'"
                @click="isPlaying = true"
              >
                {{ t('pages.debugVinyl.playing') }}
              </UButton>
              <UButton
                :variant="!isPlaying ? 'solid' : 'outline'"
                @click="isPlaying = false"
              >
                {{ t('pages.debugVinyl.paused') }}
              </UButton>
            </div>
          </UFormField>
          <UFormField :label="`${t('pages.debugVinyl.progress')}: ${progress}%`">
            <input
              v-model.number="progress"
              type="range"
              min="0"
              max="100"
              step="1"
              class="w-full"
              @input="handleProgressChange(Number(($event.target as HTMLInputElement).value))"
            >
            <div class="flex justify-between text-xs text-muted">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </UFormField>
          <UFormField :label="`${t('pages.debugVinyl.trackCount')}: ${trackCount}`">
            <input
              v-model.number="trackCount"
              type="range"
              min="1"
              max="20"
              step="1"
              class="w-full"
              @input="handleTrackCountChange(Number(($event.target as HTMLInputElement).value))"
            >
            <div class="flex justify-between text-xs text-muted">
              <span>1</span>
              <span>10</span>
              <span>20</span>
            </div>
          </UFormField>
          <UFormField :label="`${t('pages.debugVinyl.currentTrack')}: ${currentTrackNumber}`">
            <input
              v-model.number="currentTrackNumber"
              type="range"
              :min="1"
              :max="trackCount"
              step="1"
              class="w-full"
              @input="handleCurrentTrackChange(Number(($event.target as HTMLInputElement).value))"
            >
            <div class="flex justify-between text-xs text-muted">
              <span>1</span>
              <span>{{ Math.round(trackCount / 2) }}</span>
              <span>{{ trackCount }}</span>
            </div>
          </UFormField>
          <UFormField :label="t('pages.debugVinyl.artist')">
            <UInput
              v-model="artist"
              :placeholder="t('pages.debugVinyl.artistPlaceholder')"
            />
          </UFormField>
          <UFormField :label="t('pages.debugVinyl.albumTitle')">
            <UInput
              v-model="title"
              :placeholder="t('pages.debugVinyl.albumPlaceholder')"
            />
          </UFormField>
          <UFormField :label="t('pages.debugVinyl.year')">
            <UInput
              v-model.number="year"
              type="number"
              :placeholder="t('pages.debugVinyl.yearPlaceholder')"
            />
          </UFormField>
          <UFormField :label="t('pages.debugVinyl.coverUrl')" :description="t('pages.debugVinyl.coverUrlHint')">
            <UInput
              v-model="coverUrl"
              :placeholder="t('pages.debugVinyl.coverUrlPlaceholder')"
            />
          </UFormField>
          <UFormField
            :label="`${t('pages.debugVinyl.previewBox')}: ${previewBoxPx}px`"
            :description="t('pages.debugVinyl.previewBoxHint')"
          >
            <div class="flex flex-wrap items-center gap-2">
              <input
                v-model.number="previewBoxPx"
                type="range"
                min="200"
                max="720"
                step="8"
                class="min-w-[12rem] flex-1"
              >
              <UInput
                v-model.number="previewBoxPx"
                type="number"
                :min="200"
                :max="720"
                size="sm"
                class="w-24"
              />
            </div>
          </UFormField>
          <UFormField
            :label="`${t('pages.debugVinyl.plinthMax')}: ${plinthMaxPx}px`"
            :description="t('pages.debugVinyl.plinthMaxHint')"
          >
            <div class="flex flex-wrap items-center gap-2">
              <input
                v-model.number="plinthMaxPx"
                type="range"
                min="240"
                max="520"
                step="8"
                class="min-w-[12rem] flex-1"
              >
              <UInput
                v-model.number="plinthMaxPx"
                type="number"
                :min="240"
                :max="520"
                size="sm"
                class="w-24"
              />
            </div>
          </UFormField>
          <UFormField :label="t('pages.debugVinyl.quickActions')">
            <div class="flex flex-wrap gap-2">
              <UButton
                size="sm"
                variant="outline"
                @click="progress = 0"
              >
                {{ t('pages.debugVinyl.start') }}
              </UButton>
              <UButton
                size="sm"
                variant="outline"
                @click="progress = 50"
              >
                {{ t('pages.debugVinyl.middle') }}
              </UButton>
              <UButton
                size="sm"
                variant="outline"
                @click="progress = 100"
              >
                {{ t('pages.debugVinyl.end') }}
              </UButton>
              <UButton
                size="sm"
                variant="outline"
                @click="currentTrackNumber = 1"
              >
                {{ t('pages.debugVinyl.track1') }}
              </UButton>
              <UButton
                size="sm"
                variant="outline"
                @click="currentTrackNumber = trackCount"
              >
                {{ t('pages.debugVinyl.lastTrack') }}
              </UButton>
            </div>
          </UFormField>
        </div>
      </UCard>
      <UCard>
        <template #header>
          <h2 class="text-xl font-semibold">
            {{ t('pages.debugVinyl.preview') }}
          </h2>
        </template>
        <p class="text-sm text-(--ui-text-muted) mb-2">
          {{ t('pages.debugVinyl.previewResizeHint') }}
        </p>
        <div
          class="mx-auto flex items-center justify-center rounded-lg border border-dashed border-(--ui-border) bg-(--ui-bg-muted)/30"
          :style="previewFrameStyle"
        >
          <VinylPlayer
            class="h-full w-full min-h-0 min-w-0"
            :plinth-max-px="plinthMaxPx"
            :cover-url="coverUrl"
            :title="title"
            :artist="artist"
            :year="year"
            :is-playing="isPlaying"
            :progress="progress"
            :track-count="trackCount"
            :current-track-number="currentTrackNumber"
          />
        </div>
        <div class="mt-6 p-4 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-muted">{{ t('pages.debugVinyl.state') }}:</span>
              <span :class="isPlaying ? 'text-green-600' : 'text-neutral-600'">
                {{ isPlaying ? t('pages.debugVinyl.playing') : t('pages.debugVinyl.paused') }}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted">{{ t('pages.debugVinyl.progress') }}:</span>
              <span>{{ progress }}%</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted">{{ t('pages.debugVinyl.tracks') }}:</span>
              <span>{{ currentTrackNumber }} / {{ trackCount }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted">{{ t('pages.debugVinyl.artist') }}:</span>
              <span>{{ artist || t('pages.debugVinyl.noArtist') }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted">{{ t('pages.debugVinyl.albumTitle') }}:</span>
              <span>{{ title || t('pages.debugVinyl.noTitle') }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted">{{ t('pages.debugVinyl.year') }}:</span>
              <span>{{ year || t('pages.debugVinyl.noYear') }}</span>
            </div>
          </div>
        </div>
      </UCard>
    </div>
  </UContainer>
</template>
