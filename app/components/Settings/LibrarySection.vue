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
  <SettingsGroup
    icon="i-heroicons-folder"
    :title="t('common.localLibrary')"
    :description="t('common.manageFolders')"
  >
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      :title="t('common.dbError')"
      :description="error"
      icon="i-heroicons-exclamation-triangle"
    />
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
    <UCard
      v-if="folders.length > 0"
      variant="subtle"
      :ui="{ body: 'p-0 sm:p-0 divide-y divide-default', footer: 'py-2 sm:px-4' }"
    >
      <div
        v-for="folder in folders"
        :key="folder.id"
        class="flex items-center justify-between gap-3 px-4 py-2.5"
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
      <template #footer>
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
    <UEmpty
      v-else
      icon="i-heroicons-folder-open"
      :title="t('common.noFolders')"
      :description="t('common.noFoldersDescription')"
    />
  </SettingsGroup>
</template>
