<script setup lang="ts">
import { lyricsPanelFloatingCardUi } from './lyricsPanelCardUi';
</script>

<template>
  <UCard
    class="fixed right-4 bottom-24 z-30 flex w-[min(30rem,calc(100vw-2rem))] min-w-0 max-w-full flex-col overflow-hidden bg-(--ui-bg)/95 shadow-xl backdrop-blur md:right-6 md:bottom-24"
    :ui="lyricsPanelFloatingCardUi"
  >
    <template #header>
      <slot name="header" />
    </template>
    <div class="flex min-h-0 flex-col overflow-hidden">
      <slot />
    </div>
  </UCard>
</template>
