<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import useCollectionSort from '~/composables/useCollectionSort';
import { suggestArtistSortName } from '~/utils/collectionShelf';
import { sortLetter } from '~/utils/collectionSort';

interface Props {
  artist: { id: string, name: string } | null
}
const props = defineProps<Props>();
const open = defineModel<boolean>('open', { default: false });

const { t } = useI18n();
const { artistSortNames, setArtistSortName, removeArtistSortName } = useCollectionSort();

const sortName = ref('');
const saving = ref(false);
const error = ref<string | null>(null);

const existing = computed(() => (props.artist ? artistSortNames.value[props.artist.id] : undefined));
const previewLetter = computed(() => (sortName.value.trim() ? sortLetter(sortName.value) : null));
const title = computed(() => t('collectionSort.sortName.title', { artist: props.artist?.name ?? '' }));

async function run(action: () => Promise<void>) {
  saving.value = true;
  error.value = null;
  try {
    await action();
    open.value = false;
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('common.dbError');
    console.error('Failed to update artist sort name:', err);
  } finally {
    saving.value = false;
  }
}

function save() {
  const artist = props.artist;
  if (!artist || !sortName.value.trim()) return;
  return run(() => setArtistSortName(artist.id, sortName.value));
}

function remove() {
  const artist = props.artist;
  if (!artist) return;
  return run(() => removeArtistSortName(artist.id));
}

watch(open, (isOpen) => {
  if (!isOpen || !props.artist) return;
  error.value = null;
  sortName.value = existing.value ?? suggestArtistSortName(props.artist.name);
});
</script>

<template>
  <UModal v-model:open="open" :title="title" :description="t('collectionSort.sortName.description')">
    <template #body>
      <form class="flex flex-col gap-3" @submit.prevent="save">
        <UInput
          v-model="sortName"
          :placeholder="t('collectionSort.sortName.placeholder')"
          autofocus
        />
        <p v-if="previewLetter" class="text-sm text-muted">
          {{ t('collectionSort.sortName.preview', { letter: previewLetter }) }}
        </p>
        <UAlert v-if="error" color="error" :title="error" />
      </form>
    </template>
    <template #footer>
      <div class="flex items-center justify-between gap-2 w-full">
        <UButton
          v-if="existing"
          :label="t('collectionSort.sortName.remove')"
          :disabled="saving"
          icon="i-heroicons-trash"
          color="error"
          variant="ghost"
          @click="remove"
        />
        <div class="flex items-center gap-2 ml-auto">
          <UButton :label="t('common.cancel')" variant="ghost" @click="open = false" />
          <UButton
            :label="t('collectionSort.sortName.save')"
            :loading="saving"
            :disabled="!sortName.trim()"
            @click="save"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
