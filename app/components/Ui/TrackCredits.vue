<script lang="ts" setup>
interface InlineCredits {
  releaseDate?: string
  copyright?: string
  isrc?: string
  mediaTags?: string[]
}
interface Props {
  inlineCredits?: InlineCredits | null
  creditsByRole?: Record<string, string[]>
  loading?: boolean
  composerRoleKey?: string
  inlineCreditsTrackOnly?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  composerRoleKey: 'Composer',
  inlineCreditsTrackOnly: false,
});
const { t } = useI18n();
const MEDIA_TAG_LABELS: Record<string, string> = {
  HIRES_LOSSLESS: 'Hi-Res Lossless',
  LOSSLESS: 'Lossless',
  DOLBY_ATMOS: 'Dolby Atmos',
  SONY_360RA: 'Sony 360 Reality Audio',
  MQA: 'MQA',
};
const hasInlineCredits = computed(() => {
  const c = props.inlineCredits;
  if (!c) return false;
  if (props.inlineCreditsTrackOnly) return !!c.isrc;
  return !!c.releaseDate || !!c.copyright || !!c.isrc || (c.mediaTags?.length ?? 0) > 0;
});
const otherRoles = computed(() => {
  if (!props.creditsByRole) return [];
  return Object.entries(props.creditsByRole).filter(
    ([role]) => role !== props.composerRoleKey,
  );
});
const visibleMediaTags = computed(() => {
  if (props.inlineCreditsTrackOnly) return [];
  return props.inlineCredits?.mediaTags ?? [];
});
</script>

<template>
  <div v-if="loading" class="flex flex-col gap-2 text-xs">
    <div v-for="n in 3" :key="n" class="flex flex-wrap items-baseline gap-1">
      <USkeleton class="h-3 w-16" />
      <USkeleton class="h-3 w-32" />
    </div>
  </div>
  <template v-else>
    <div v-if="hasInlineCredits" class="flex flex-wrap justify-center items-center gap-1 mb-2">
      <UBadge
        v-if="!inlineCreditsTrackOnly && inlineCredits?.releaseDate"
        :label="t('queue.released', { date: inlineCredits.releaseDate })"
        leading-icon="i-heroicons-calendar"
        variant="soft"
        size="sm"
      />
      <UBadge
        v-if="!inlineCreditsTrackOnly && inlineCredits?.copyright"
        :label="inlineCredits.copyright"
        leading-icon="i-mdi-copyright"
        variant="soft"
        size="sm"
      />
      <UBadge
        v-if="inlineCredits?.isrc"
        :label="`ISRC ${inlineCredits.isrc}`"
        leading-icon="i-heroicons-document-text"
        variant="soft"
        size="sm"
      />
      <UBadge
        v-for="tag in visibleMediaTags"
        :key="tag"
        :label="MEDIA_TAG_LABELS[tag] ?? tag"
        leading-icon="i-heroicons-tag"
        variant="soft"
        size="sm"
      />
    </div>
    <div v-if="creditsByRole && otherRoles.length > 0" class="flex flex-col gap-2 text-xs">
      <div
        v-for="[role, names] in otherRoles"
        :key="role"
        class="flex flex-wrap items-baseline gap-1"
      >
        <span class="font-medium text-muted shrink-0">{{ role }}:</span>
        <span>{{ names.join(', ') }}</span>
      </div>
    </div>
  </template>
</template>
