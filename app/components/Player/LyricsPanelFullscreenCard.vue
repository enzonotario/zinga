<script setup lang="ts">
import { lyricsPanelCardUi } from './lyricsPanelCardUi';
</script>

<template>
  <div class="flex max-h-full min-h-0 h-full flex-1 flex-col overflow-hidden py-2">
    <UCard
      class="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      :ui="lyricsPanelCardUi"
    >
      <template #header>
        <slot name="header" />
      </template>
      <slot />
    </UCard>
  </div>
</template>
