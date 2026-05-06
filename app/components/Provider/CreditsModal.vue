<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import useProvider from '~/composables/useProvider';

interface Props {
  open: boolean
  type: 'album' | 'artist'
  albumId?: string
  albumTitle?: string
  albumCopyright?: string
  albumBarcodeId?: string
  albumReleaseDate?: string
  albumMediaTags?: string[]
  albumArtists?: { id: string, name: string }[]
  artistId?: string
  artistName?: string
  artistExternalLinks?: { href: string, meta: { type: string } }[]
}
const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
}>();
const { t, locale } = useI18n();
const provider = useProvider();
const loading = ref(false);
const providers = ref<any[]>([]);
const error = ref<string | null>(null);
const linkTypeLabels = computed<Record<string, string>>(() => ({
  OFFICIAL_HOMEPAGE: t('linkTypes.OFFICIAL_HOMEPAGE'),
  TWITTER: t('linkTypes.TWITTER'),
  FACEBOOK: t('linkTypes.FACEBOOK'),
  INSTAGRAM: t('linkTypes.INSTAGRAM'),
  TIKTOK: t('linkTypes.TIKTOK'),
  SNAPCHAT: t('linkTypes.SNAPCHAT'),
  TIDAL_SHARING: t('linkTypes.TIDAL_SHARING'),
  CASHAPP_CONTRIBUTIONS: t('linkTypes.CASHAPP_CONTRIBUTIONS'),
}));
const linkTypeIcons: Record<string, string> = {
  OFFICIAL_HOMEPAGE: 'i-heroicons-globe-alt',
  TWITTER: 'i-simple-icons-x',
  FACEBOOK: 'i-simple-icons-facebook',
  INSTAGRAM: 'i-simple-icons-instagram',
  TIKTOK: 'i-simple-icons-tiktok',
  SNAPCHAT: 'i-simple-icons-snapchat',
  TIDAL_SHARING: 'i-heroicons-share',
  CASHAPP_CONTRIBUTIONS: 'i-heroicons-currency-dollar',
};
const isOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value),
});
watch(() => props.open, async (open) => {
  if (open && props.type === 'album' && props.albumId) {
    loading.value = true;
    error.value = null;
    try {
      const result = await provider.getAlbumProviders(props.albumId);
      providers.value = result?.included?.filter((item: any) => item.type === 'providers') || [];
    } catch (err) {
      console.error('Error loading providers:', err);
      error.value = t('album.creditsModal.couldNotLoadProviders');
    } finally {
      loading.value = false;
    }
  }
}, { immediate: true });
const formattedReleaseDate = computed(() => {
  if (!props.albumReleaseDate) return null;
  try {
    return new Date(props.albumReleaseDate).toLocaleDateString(locale.value, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return props.albumReleaseDate;
  }
});
const mediaTagLabels: Record<string, string> = {
  HIRES_LOSSLESS: 'Hi-Res Lossless',
  LOSSLESS: 'Lossless',
  DOLBY_ATMOS: 'Dolby Atmos',
  SONY_360RA: 'Sony 360 Reality Audio',
  MQA: 'MQA',
};
const filteredExternalLinks = computed(() => {
  if (!props.artistExternalLinks) return [];
  return props.artistExternalLinks.filter(
    (link) => link.meta?.type && !link.meta.type.startsWith('TIDAL_AUTOPLAY'),
  );
});
</script>

<template>
  <UModal v-model:open="isOpen">
    <template #content>
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold">
              {{ type === 'album' ? $t('album.creditsModal.albumCredits') : $t('album.creditsModal.artistInfo') }}
            </h3>
            <UButton
              icon="i-heroicons-x-mark"
              variant="ghost"
              size="sm"
              @click="isOpen = false"
            />
          </div>
        </template>
        <div class="space-y-6">
          <template v-if="type === 'album'">
            <div v-if="albumTitle" class="flex flex-col gap-1">
              <h4 class="text-sm font-medium text-muted">
                {{ $t('album.creditsModal.title') }}
              </h4>
              <p class="text-base">
                {{ albumTitle }}
              </p>
            </div>
            <div v-if="albumArtists && albumArtists.length > 0" class="flex flex-col gap-1">
              <h4 class="text-sm font-medium text-muted">
                {{ $t('album.creditsModal.artists') }}
              </h4>
              <div class="flex flex-wrap gap-2">
                <NuxtLink
                  v-for="artist in albumArtists"
                  :key="artist.id"
                  :to="`/artist/${artist.id}`"
                  class="text-primary hover:underline"
                  @click="isOpen = false"
                >
                  {{ artist.name }}
                </NuxtLink>
              </div>
            </div>
            <div v-if="formattedReleaseDate" class="flex flex-col gap-1">
              <h4 class="text-sm font-medium text-muted">
                {{ $t('album.creditsModal.releaseDate') }}
              </h4>
              <p class="text-base">
                {{ formattedReleaseDate }}
              </p>
            </div>
            <div v-if="loading" class="flex flex-col gap-1">
              <h4 class="text-sm font-medium text-muted">
                {{ $t('album.creditsModal.recordLabel') }}
              </h4>
              <USkeleton class="h-5 w-32" />
            </div>
            <div v-else-if="providers.length > 0" class="flex flex-col gap-1">
              <h4 class="text-sm font-medium text-muted">
                {{ $t('album.creditsModal.recordLabel') }}
              </h4>
              <div class="flex flex-wrap gap-2">
                <UBadge
                  v-for="prov in providers"
                  :key="prov.id"
                  :label="prov.attributes?.name || $t('album.creditsModal.unknownLabel')"
                  variant="subtle"
                />
              </div>
            </div>
            <div v-if="albumCopyright" class="flex flex-col gap-1">
              <h4 class="text-sm font-medium text-muted">
                {{ $t('common.copyright') }}
              </h4>
              <p class="text-sm text-muted">
                {{ albumCopyright }}
              </p>
            </div>
            <div v-if="albumBarcodeId" class="flex flex-col gap-1">
              <h4 class="text-sm font-medium text-muted">
                {{ $t('album.creditsModal.barcode') }}
              </h4>
              <p class="text-sm font-mono">
                {{ albumBarcodeId }}
              </p>
            </div>
            <div v-if="albumMediaTags && albumMediaTags.length > 0" class="flex flex-col gap-1">
              <h4 class="text-sm font-medium text-muted">
                {{ $t('album.creditsModal.audioQuality') }}
              </h4>
              <div class="flex flex-wrap gap-2">
                <UBadge
                  v-for="tag in albumMediaTags"
                  :key="tag"
                  :label="mediaTagLabels[tag] || tag"
                  variant="subtle"
                />
              </div>
            </div>
          </template>
          <template v-else-if="type === 'artist'">
            <div v-if="artistName" class="flex flex-col gap-1">
              <h4 class="text-sm font-medium text-muted">
                {{ $t('album.creditsModal.name') }}
              </h4>
              <p class="text-base">
                {{ artistName }}
              </p>
            </div>
            <div v-if="filteredExternalLinks.length > 0" class="flex flex-col gap-2">
              <h4 class="text-sm font-medium text-muted">
                {{ $t('album.creditsModal.links') }}
              </h4>
              <div class="space-y-2">
                <a
                  v-for="(link, index) in filteredExternalLinks"
                  :key="index"
                  :href="link.href"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex items-center gap-2 p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                >
                  <UIcon
                    :name="linkTypeIcons[link.meta.type] || 'i-heroicons-link'"
                    class="w-5 h-5 text-muted"
                  />
                  <span class="text-sm">
                    {{ linkTypeLabels[link.meta.type] || link.meta.type }}
                  </span>
                  <UIcon
                    name="i-heroicons-arrow-top-right-on-square"
                    class="w-4 h-4 text-muted ml-auto"
                  />
                </a>
              </div>
            </div>
            <UAlert
              v-if="filteredExternalLinks.length === 0"
              variant="soft"
              :title="$t('album.creditsModal.noExternalLinks')"
              :description="$t('album.creditsModal.noExternalLinksDescription')"
              icon="i-heroicons-information-circle"
            />
          </template>
          <UAlert
            v-if="error"
            color="error"
            variant="soft"
            :title="error"
            icon="i-heroicons-exclamation-triangle"
          />
        </div>
      </UCard>
    </template>
  </UModal>
</template>
