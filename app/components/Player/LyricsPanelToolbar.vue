<script setup lang="ts">
interface Props {
  trackTitle: string
  provider: string | null
  lyricsFontSizePx: number
  lyricsFontMinPx: number
  lyricsFontMaxPx: number
}
const props = defineProps<Props>();
const emit = defineEmits<{
  bumpFont: [delta: number]
  applyFontInput: [v: unknown]
}>();
</script>

<template>
  <div class="flex min-w-0 items-start gap-2">
    <p class="min-w-0 flex-1 text-pretty break-words text-sm font-medium">
      {{ $t('lyrics.lyrics') }}: {{ props.trackTitle }}
    </p>
    <div class="flex shrink-0 flex-nowrap items-center gap-2">
      <UBadge v-if="props.provider" variant="subtle" color="neutral" size="sm">
        {{ props.provider }}
      </UBadge>
      <UPopover
        :content="{ side: 'bottom', align: 'end', sideOffset: 8 }"
        :ui="{ content: 'p-3 min-w-[12rem]' }"
      >
        <UButton
          icon="i-heroicons-ellipsis-vertical"
          variant="ghost"
          color="neutral"
          size="xs"
          :aria-label="$t('lyrics.lyricsOptions')"
        />
        <template #content>
          <div class="flex flex-col gap-2">
            <span class="text-xs font-medium text-(--ui-text-muted)">{{ $t('lyrics.fontSize') }}</span>
            <div
              class="flex items-center gap-0.5 rounded-md border border-(--ui-border) bg-(--ui-bg-muted)/40 p-0.5"
              role="group"
              :aria-label="$t('lyrics.fontSize')"
            >
              <UButton
                icon="i-heroicons-minus"
                variant="ghost"
                color="neutral"
                size="xs"
                :disabled="props.lyricsFontSizePx <= props.lyricsFontMinPx"
                :aria-label="$t('lyrics.decreaseFontSize')"
                @click="emit('bumpFont', -1)"
              />
              <UInput
                :model-value="String(props.lyricsFontSizePx)"
                type="number"
                :min="props.lyricsFontMinPx"
                :max="props.lyricsFontMaxPx"
                size="xs"
                class="w-14 text-center"
                :aria-label="$t('lyrics.fontSize')"
                @update:model-value="emit('applyFontInput', $event)"
              />
              <UButton
                icon="i-heroicons-plus"
                variant="ghost"
                color="neutral"
                size="xs"
                :disabled="props.lyricsFontSizePx >= props.lyricsFontMaxPx"
                :aria-label="$t('lyrics.increaseFontSize')"
                @click="emit('bumpFont', 1)"
              />
            </div>
          </div>
        </template>
      </UPopover>
      <slot name="actions" />
    </div>
  </div>
</template>
