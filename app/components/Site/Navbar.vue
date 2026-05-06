<script lang="ts" setup>
const { pages } = usePages();
const { showSidebar } = useSidebar();
const colorMode = useColorMode();
const mobileItems = ref<any[]>([
  [
    {
      icon: 'lucide:menu',
      onSelect: () => showSidebar.value = true,
    },
  ],
]);
const desktopItems = computed(() => [
  pages.value,
]);
</script>

<template>
  <header class="sticky top-2 z-50 pb-2">
    <UContainer
      class="md:py-2 relative z-10 bg-(--ui-bg)/90 backdrop-blur rounded-full shadow-md"
    >
      <div class="flex flex-row items-center flex-1">
        <div class="md:hidden flex items-center">
          <UNavigationMenu
            :items="mobileItems"
            variant="link"
            :ui="{
              root: 'flex-1',
            }"
          />
          <UColorModeButton />
        </div>
        <ULink to="/" class="flex items-center gap-2 text-neutral">
          <UAvatar
            :icon="colorMode.value === 'dark' ? 'local:logo-white' : 'local:logo-black'"
            alt="Zinga App Logo"
            :ui="{
              icon: 'w-8 h-8',
            }"
            class="bg-transparent"
          />
        </ULink>
        <USeparator orientation="vertical" class="mx-4 hidden md:block h-6" />
        <UNavigationMenu
          :items="desktopItems"
          variant="link"
          :ui="{
            root: 'hidden md:flex md:flex-1',
            viewportWrapper: 'max-w-2xl absolute-center-h',
            list: 'md:gap-x-2',
          }"
        />
        <div class="items-center gap-2 flex">
          <ProviderSearch />
          <ProviderAuthStatus />
          <UColorModeButton />
        </div>
      </div>
    </UContainer>
  </header>
</template>
