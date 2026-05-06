<script lang="ts" setup>
const { app: { name } } = useAppConfig();
const { pages } = usePages();
const { showSidebar } = useSidebar();
const colorMode = useColorMode();
const tauriVersion = await useTauriAppGetTauriVersion();
const items = computed(() => [
  pages.value,
  [
    {
      label: `v${tauriVersion}`,
      disabled: true,
    },
  ],
]);
</script>

<template>
  <USlideover :open="showSidebar" @update:open="showSidebar = false">
    <template #title>
      <div class="flex items-center gap-x-3">
        <UAvatar
          :icon="colorMode.value === 'dark' ? 'local:logo-white' : 'local:logo-black'"
          :ui="{
            icon: 'size-6',
          }"
          class="bg-transparent"
        />
        <span>{{ name }}</span>
      </div>
    </template>
    <template #description>
      <VisuallyHidden>{{ $t('app.description') }}</VisuallyHidden>
    </template>
    <template #body>
      <UNavigationMenu
        orientation="vertical"
        :items="items"
      />
    </template>
  </USlideover>
</template>
