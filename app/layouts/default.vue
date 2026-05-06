<script setup lang="ts">
const route = useRoute();
const isFixedLayout = computed(() => route.meta.fixedLayout === true);
</script>

<template>
  <div class="relative min-h-screen">
    <SiteAppBackground />
    <div class="relative flex flex-col min-h-screen h-screen overflow-hidden">
      <SiteSidebar />
      <div
        id="app-scroll"
        class="flex flex-col grow relative overflow-y-auto"
        :class="isFixedLayout ? 'md:overflow-hidden' : ''"
      >
        <UContainer
          class="w-full mx-auto"
          :class="isFixedLayout
            ? 'max-w-[96vw] 2xl:max-w-[2200px] md:flex md:flex-col md:h-full md:overflow-hidden'
            : 'max-w-360'"
        >
          <SiteNavbar class="shrink-0" />
          <div :class="isFixedLayout ? 'md:flex-1 md:overflow-hidden md:min-h-0' : ''">
            <slot />
          </div>
        </UContainer>
      </div>
      <ClientOnly>
        <SystemTerminalPanel class="shrink-0" />
      </ClientOnly>
      <NavBottomBar class="shrink-0" />
    </div>
    <UiImageFullscreen />
  </div>
</template>
