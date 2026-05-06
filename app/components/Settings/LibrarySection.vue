<script lang="ts" setup>
import { open } from '@tauri-apps/plugin-dialog';
import { onMounted, ref } from 'vue';
import useLocalLibrary from '~/composables/useLocalLibrary';

const { t } = useI18n();
const { folders, scanning, loadFolders, addFolder, removeFolder, refreshLibrary } = useLocalLibrary();
const newFolderPath = ref('');
const isAdding = ref(false);
const error = ref<string | null>(null);

onMounted(() => {
  loadFolders().catch((err) => {
    error.value = err instanceof Error ? err.message : String(err);
  });
});

async function handleSelectFolder() {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: t('common.selectMusicFolder'),
    });

    if (selected) {
      newFolderPath.value = selected as string;
      await handleAddFolder();
    }
  } catch (err) {
    console.error('Error seleccionando carpeta:', err);
  }
}

async function handleAddFolder() {
  if (!newFolderPath.value) return;
  isAdding.value = true;
  try {
    await addFolder(newFolderPath.value);
    newFolderPath.value = '';
  } catch (err) {
    console.error(err);
  } finally {
    isAdding.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h3 class="text-lg font-medium">
        {{ t('common.localLibrary') }}
      </h3>
      <p class="text-sm text-(--ui-text-muted)">
        {{ t('common.manageFolders') }}
      </p>
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      :title="t('common.dbError')"
      :description="error"
      icon="i-heroicons-exclamation-triangle"
      class="mb-4"
    />

    <UCard>
      <div class="space-y-4">
        <div class="flex gap-2">
          <UInput
            v-model="newFolderPath"
            placeholder="/home/usuario/Musica"
            class="flex-1"
            :disabled="isAdding"
            @keyup.enter="handleAddFolder"
          >
            <template #trailing>
              <UButton
                icon="i-heroicons-folder-open"
                variant="ghost"
                color="neutral"
                size="sm"
                :disabled="isAdding"
                @click="handleSelectFolder"
              />
            </template>
          </UInput>
          <UButton
            icon="i-heroicons-plus"
            :loading="isAdding"
            @click="handleAddFolder"
          >
            {{ t('common.addFolder') }}
          </UButton>
        </div>

        <div v-if="folders.length > 0" class="space-y-2">
          <div
            v-for="folder in folders"
            :key="folder.id"
            class="flex items-center justify-between p-3 rounded-lg border border-(--ui-border) bg-(--ui-bg-elevated)"
          >
            <div class="flex items-center gap-3 min-w-0">
              <UIcon name="i-heroicons-folder" class="w-5 h-5 text-primary shrink-0" />
              <span class="truncate text-sm font-medium">{{ folder.path }}</span>
            </div>
            <UButton
              icon="i-heroicons-trash"
              variant="ghost"
              color="error"
              size="sm"
              @click="removeFolder(folder.id)"
            />
          </div>
        </div>
        <UEmpty
          v-else
          icon="i-heroicons-folder-open"
          :title="t('common.noFolders')"
          :description="t('common.noFoldersDescription')"
        />
      </div>

      <template v-if="folders.length > 0" #footer>
        <div class="flex justify-end">
          <UButton
            variant="ghost"
            icon="i-heroicons-arrow-path"
            :loading="scanning"
            @click="refreshLibrary"
          >
            {{ t('common.scanNow') }}
          </UButton>
        </div>
      </template>
    </UCard>
  </div>
</template>
