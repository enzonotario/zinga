<script lang="ts" setup>
definePageMeta({
  name: 'settings',
  nameKey: 'pages.settings.name',
  icon: 'lucide:settings',
  category: 'main',
  descriptionKey: 'pages.settings.description',
});
const { t } = useI18n();
const { sections, activeSection } = useSettingsSections();
</script>

<template>
  <div class="min-h-full py-8">
    <UCard>
      <template #header>
        <h1 class="text-lg font-medium">
          {{ t('pages.settings.title') }}
        </h1>
      </template>
      <div class="flex gap-6">
        <nav class="w-48 shrink-0 border-r border-(--ui-border) pr-4">
          <ul class="space-y-1">
            <li v-for="section in sections" :key="section.id">
              <button
                class="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer"
                :class="activeSection === section.id
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-(--ui-text-muted) hover:bg-(--ui-bg-elevated)'"
                @click="activeSection = section.id"
              >
                <UIcon :name="section.icon" class="w-4 h-4" />
                {{ t(section.labelKey) }}
              </button>
            </li>
          </ul>
        </nav>
        <div class="flex-1 min-w-0">
          <SettingsGeneralSection v-if="activeSection === 'general'" />
          <SettingsSystemSection v-else-if="activeSection === 'system'" />
          <SettingsRemoteSection v-else-if="activeSection === 'remote'" />
          <SettingsLibrarySection v-else-if="activeSection === 'library'" />
          <SettingsClientSection v-else-if="activeSection === 'client'" />
          <SettingsAboutSection v-else-if="activeSection === 'about'" />
        </div>
      </div>
    </UCard>
  </div>
</template>
