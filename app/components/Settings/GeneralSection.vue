<script lang="ts" setup>
const { t, locale, locales, setLocale } = useI18n();
const colorMode = useColorMode();
const {
  debugMode,
  setDebugMode,
  showExplicitIndicator,
  setShowExplicitIndicator,
  closeToTray,
  setCloseToTray,
} = useSettings();
const colorModeOptions = computed(() => [
  { value: 'system', label: t('pages.settings.themeSystem'), icon: 'i-heroicons-computer-desktop' },
  { value: 'light', label: t('pages.settings.themeLight'), icon: 'i-heroicons-sun' },
  { value: 'dark', label: t('pages.settings.themeDark'), icon: 'i-heroicons-moon' },
]);
const availableLocales = computed(() =>
  (locales.value as { code: string, name: string }[]).map((l) => ({
    value: l.code,
    label: l.name,
  })),
);
</script>

<template>
  <div class="divide-y divide-default">
    <SettingsGroup icon="i-heroicons-paint-brush" :title="t('pages.settings.theme')">
      <URadioGroup
        :model-value="colorMode.preference"
        :items="colorModeOptions"
        value-key="value"
        @update:model-value="colorMode.preference = $event"
      >
        <template #label="{ item }">
          <div class="flex items-center gap-3">
            <UIcon :name="item.icon" class="w-5 h-5 text-(--ui-text-muted)" />
            <span class="font-medium">{{ item.label }}</span>
          </div>
        </template>
      </URadioGroup>
    </SettingsGroup>
    <SettingsGroup icon="i-heroicons-language" :title="t('pages.settings.language')">
      <URadioGroup
        :model-value="locale"
        :items="availableLocales"
        value-key="value"
        @update:model-value="setLocale($event)"
      >
        <template #label="{ item }">
          <span class="font-medium">{{ item.label }}</span>
        </template>
      </URadioGroup>
    </SettingsGroup>
    <SettingsGroup icon="i-heroicons-wrench-screwdriver" :title="t('pages.settings.advanced')">
      <UFormField
        :label="t('pages.settings.closeToTray')"
        :description="t('pages.settings.closeToTrayDescription')"
      >
        <USwitch
          :model-value="closeToTray"
          @update:model-value="setCloseToTray"
        />
      </UFormField>
      <UFormField
        :label="t('pages.settings.debugMode')"
        :description="t('pages.settings.debugModeDescription')"
      >
        <USwitch
          :model-value="debugMode"
          @update:model-value="setDebugMode"
        />
      </UFormField>
      <UFormField
        :label="t('pages.settings.showExplicitIndicator')"
        :description="t('pages.settings.showExplicitIndicatorDescription')"
      >
        <USwitch
          :model-value="showExplicitIndicator"
          @update:model-value="setShowExplicitIndicator"
        />
      </UFormField>
    </SettingsGroup>
  </div>
</template>
