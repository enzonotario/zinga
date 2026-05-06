<script lang="ts" setup>
withDefaults(
  defineProps<{
    variant?: 'albums' | 'artists'
    count?: number
  }>(),
  { variant: 'albums', count: 12 },
);
</script>

<template>
  <div
    v-if="variant === 'albums'"
    class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4"
  >
    <div
      v-for="i in count"
      :key="i"
      class="flex flex-col gap-2 p-3"
    >
      <USkeleton class="aspect-square w-full rounded-lg" />
      <USkeleton class="h-4 w-full" />
      <USkeleton class="h-3 w-3/4" />
      <USkeleton class="h-3 w-1/2" />
    </div>
  </div>
  <div
    v-else
    class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4"
  >
    <div
      v-for="i in count"
      :key="i"
      class="flex flex-col items-center gap-3 p-3"
    >
      <USkeleton class="w-24 h-24 md:w-28 md:h-28 rounded-full" />
      <USkeleton class="h-4 w-20" />
    </div>
  </div>
</template>
