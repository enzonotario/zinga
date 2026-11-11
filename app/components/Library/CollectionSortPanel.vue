<script lang="ts" setup>
import type { CollectionSortOptions, GroupBy, SortKey, SortRule } from '~/utils/collectionSort';
import { computed } from 'vue';
import useCollectionSort from '~/composables/useCollectionSort';
import { GROUP_BY_VALUES, SORT_KEYS } from '~/utils/collectionSort';

interface Props {
  artistNames?: Record<string, string>
}
const props = withDefaults(defineProps<Props>(), {
  artistNames: () => ({}),
});

const MAX_RULES = 4;
const OPTION_KEYS: (keyof Omit<CollectionSortOptions, 'typeOrder'>)[] = [
  'ignoreArticles',
  'variousArtistsLast',
  'singlesSeparate',
  'numbersFirst',
];

const { t } = useI18n();
const {
  config,
  presets,
  artistSortNames,
  computingColors,
  colorProgress,
  needsCoverColors,
  applyPreset,
  setRules,
  setGroupBy,
  setOption,
  resetConfig,
  removeArtistSortName,
} = useCollectionSort();

const open = defineModel<boolean>('open', { default: false });

const activePreset = computed(() => presets.find((p) => p.id === config.value.preset) ?? null);
const groupByItems = computed(() => GROUP_BY_VALUES.map((value) => ({ label: t(`collectionSort.groupBy.${value}`), value })));
const sortNameEntries = computed(() =>
  Object.entries(artistSortNames.value)
    .map(([artistId, sortName]) => ({ artistId, sortName, name: props.artistNames[artistId] ?? artistId }))
    .sort((a, b) => a.sortName.localeCompare(b.sortName, 'es')),
);
const canAddRule = computed(() => config.value.rules.length < MAX_RULES && config.value.rules.length < SORT_KEYS.length);
const showColorProgress = computed(() => needsCoverColors.value && computingColors.value && colorProgress.value.total > 0);

function keyItems(index: number) {
  const used = new Set(config.value.rules.filter((_, i) => i !== index).map((r) => r.key));
  return SORT_KEYS.filter((key) => !used.has(key)).map((value) => ({ label: t(`collectionSort.keys.${value}`), value }));
}

function updateRule(index: number, patch: Partial<SortRule>) {
  setRules(config.value.rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
}

function setRuleKey(index: number, key: SortKey) {
  updateRule(index, { key });
}

function toggleDirection(index: number) {
  updateRule(index, { desc: !config.value.rules[index]!.desc });
}

function moveRule(index: number, offset: -1 | 1) {
  const rules = [...config.value.rules];
  const target = index + offset;
  if (target < 0 || target >= rules.length) return;
  [rules[index], rules[target]] = [rules[target]!, rules[index]!];
  setRules(rules);
}

function removeRule(index: number) {
  if (config.value.rules.length <= 1) return;
  setRules(config.value.rules.filter((_, i) => i !== index));
}

function addRule() {
  const used = new Set(config.value.rules.map((r) => r.key));
  const key = SORT_KEYS.find((k) => !used.has(k));
  if (!key || !canAddRule.value) return;
  setRules([...config.value.rules, { key, desc: false }]);
}

async function removeSortName(artistId: string) {
  try {
    await removeArtistSortName(artistId);
  } catch (err) {
    console.error('Failed to remove artist sort name:', err);
  }
}
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="t('collectionSort.panel.title')"
    :description="activePreset ? t(activePreset.labelKey) : t('collectionSort.panel.custom')"
    side="right"
  >
    <UButton
      :label="t('collectionSort.panel.button')"
      icon="i-heroicons-bars-arrow-down"
      variant="ghost"
    />
    <template #body>
      <div class="flex flex-col gap-6">
        <section class="flex flex-col gap-2">
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-sm font-medium text-muted">
              {{ t('collectionSort.panel.presets') }}
            </h3>
            <UBadge
              v-if="!activePreset"
              :label="t('collectionSort.panel.custom')"
              color="primary"
              variant="subtle"
              size="sm"
            />
          </div>
          <div class="flex flex-col gap-1">
            <button
              v-for="preset in presets"
              :key="preset.id"
              type="button"
              class="flex items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors cursor-pointer ring ring-inset"
              :class="config.preset === preset.id
                ? 'bg-primary/10 ring-primary/40'
                : 'ring-transparent hover:bg-accented/40'"
              :aria-pressed="config.preset === preset.id"
              @click="applyPreset(preset.id)"
            >
              <UIcon
                :name="preset.icon"
                class="size-5 mt-0.5 shrink-0"
                :class="config.preset === preset.id ? 'text-primary' : 'text-muted'"
              />
              <span class="flex flex-col min-w-0">
                <span class="text-sm font-medium">{{ t(preset.labelKey) }}</span>
                <span class="text-xs text-muted">{{ t(preset.descriptionKey) }}</span>
              </span>
            </button>
          </div>
        </section>

        <USeparator />

        <section class="flex flex-col gap-2">
          <h3 class="text-sm font-medium text-muted">
            {{ t('collectionSort.panel.rules') }}
          </h3>
          <div
            v-for="(rule, index) in config.rules"
            :key="rule.key"
            class="flex items-center gap-1"
          >
            <span class="w-20 shrink-0 text-xs text-muted">
              {{ index === 0 ? t('collectionSort.panel.sortBy') : t('collectionSort.panel.thenBy') }}
            </span>
            <USelect
              :model-value="rule.key"
              :items="keyItems(index)"
              value-key="value"
              size="sm"
              class="flex-1 min-w-0"
              @update:model-value="(value) => setRuleKey(index, value as SortKey)"
            />
            <UButton
              :icon="rule.desc ? 'i-lucide-arrow-down-wide-narrow' : 'i-lucide-arrow-up-narrow-wide'"
              :aria-label="rule.desc ? t('collectionSort.panel.descending') : t('collectionSort.panel.ascending')"
              :title="rule.desc ? t('collectionSort.panel.descending') : t('collectionSort.panel.ascending')"
              variant="ghost"
              color="neutral"
              size="sm"
              @click="toggleDirection(index)"
            />
            <UButton
              icon="i-heroicons-chevron-up"
              :aria-label="t('collectionSort.panel.moveUp')"
              :disabled="index === 0"
              variant="ghost"
              color="neutral"
              size="sm"
              @click="moveRule(index, -1)"
            />
            <UButton
              icon="i-heroicons-chevron-down"
              :aria-label="t('collectionSort.panel.moveDown')"
              :disabled="index === config.rules.length - 1"
              variant="ghost"
              color="neutral"
              size="sm"
              @click="moveRule(index, 1)"
            />
            <UButton
              icon="i-heroicons-x-mark"
              :aria-label="t('collectionSort.panel.removeRule')"
              :disabled="config.rules.length <= 1"
              variant="ghost"
              color="neutral"
              size="sm"
              @click="removeRule(index)"
            />
          </div>
          <UButton
            v-if="canAddRule"
            :label="t('collectionSort.panel.addRule')"
            icon="i-heroicons-plus"
            variant="ghost"
            size="sm"
            class="self-start"
            @click="addRule"
          />
        </section>

        <USeparator />

        <section class="flex flex-col gap-3">
          <UFormField :label="t('collectionSort.panel.dividers')">
            <USelect
              :model-value="config.groupBy"
              :items="groupByItems"
              value-key="value"
              class="w-full"
              @update:model-value="(value) => setGroupBy(value as GroupBy)"
            />
          </UFormField>
          <div v-if="showColorProgress" class="flex flex-col gap-1.5">
            <span class="text-xs text-muted">
              {{ t('collectionSort.panel.analyzingCovers', { done: colorProgress.done, total: colorProgress.total }) }}
            </span>
            <UProgress :model-value="colorProgress.done" :max="colorProgress.total" size="sm" />
          </div>
        </section>

        <USeparator />

        <section class="flex flex-col gap-3">
          <h3 class="text-sm font-medium text-muted">
            {{ t('collectionSort.panel.options') }}
          </h3>
          <USwitch
            v-for="key in OPTION_KEYS"
            :key="key"
            :model-value="config.options[key]"
            :label="t(`collectionSort.options.${key}`)"
            @update:model-value="(value) => setOption(key, value)"
          />
        </section>

        <USeparator />

        <section class="flex flex-col gap-2">
          <h3 class="text-sm font-medium text-muted">
            {{ t('collectionSort.panel.sortNames') }}
          </h3>
          <p class="text-xs text-muted">
            {{ t('collectionSort.panel.sortNamesHint') }}
          </p>
          <ul v-if="sortNameEntries.length > 0" class="flex flex-col divide-y divide-default">
            <li
              v-for="entry in sortNameEntries"
              :key="entry.artistId"
              class="flex items-center gap-2 py-1.5"
            >
              <span class="flex flex-col min-w-0 flex-1">
                <span class="text-sm font-medium truncate">{{ entry.sortName }}</span>
                <span class="text-xs text-muted truncate">{{ entry.name }}</span>
              </span>
              <UButton
                icon="i-heroicons-x-mark"
                :aria-label="t('collectionSort.sortName.remove')"
                variant="ghost"
                color="neutral"
                size="sm"
                @click="removeSortName(entry.artistId)"
              />
            </li>
          </ul>
          <p v-else class="text-sm text-muted">
            {{ t('collectionSort.panel.noSortNames') }}
          </p>
        </section>
      </div>
    </template>
    <template #footer>
      <UButton
        :label="t('collectionSort.panel.reset')"
        icon="i-heroicons-arrow-uturn-left"
        variant="ghost"
        @click="resetConfig"
      />
    </template>
  </USlideover>
</template>
