<script lang="ts" setup>
withDefaults(
  defineProps<{
    trackCardsCount?: number
  }>(),
  { trackCardsCount: 9 },
);
</script>

<template>
  <div class="flex flex-col gap-6">
    <UCard :ui="{ body: 'flex flex-col min-w-0 w-full h-full' }">
      <div class="flex flex-col md:flex-row gap-6">
        <USkeleton
          class="w-44 h-44 md:w-56 md:h-56 shrink-0 rounded"
        />
        <div class="flex flex-col justify-end flex-1 min-w-0 gap-3">
          <USkeleton class="h-9 w-full max-w-md" />
          <div class="flex items-center gap-2">
            <USkeleton class="h-5 w-5 rounded" />
            <USkeleton class="h-5 w-40" />
          </div>
          <div class="flex flex-wrap gap-3">
            <USkeleton class="h-4 w-32" />
            <USkeleton class="h-4 w-16" />
          </div>
          <span class="flex-1" />
          <div class="flex flex-wrap items-center gap-3">
            <USkeleton class="h-10 w-28 rounded-full" />
            <div class="flex gap-1">
              <USkeleton class="h-9 w-9 rounded" />
              <USkeleton class="h-9 w-9 rounded" />
            </div>
          </div>
        </div>
      </div>
    </UCard>
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      <UCard
        v-for="i in trackCardsCount"
        :key="i"
        class="p-4"
      >
        <div class="flex flex-col gap-3">
          <div class="flex items-start gap-3">
            <USkeleton class="w-8 h-8 shrink-0 rounded-full" />
            <div class="flex-1 min-w-0 space-y-2">
              <USkeleton class="h-4 w-full max-w-48" />
              <USkeleton class="h-3 w-32" />
            </div>
            <USkeleton class="h-4 w-10 shrink-0" />
            <USkeleton class="h-8 w-8 shrink-0 rounded" />
          </div>
          <div class="flex flex-wrap gap-1">
            <USkeleton class="h-3 w-16" />
            <USkeleton class="h-3 w-32" />
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
