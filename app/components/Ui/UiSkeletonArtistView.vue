<script lang="ts" setup>
withDefaults(
  defineProps<{
    showAlbumGrid?: boolean
  }>(),
  { showAlbumGrid: false },
);
</script>

<template>
  <div class="space-y-6">
    <UCard :ui="{ body: 'flex flex-col min-w-0 w-full h-full' }">
      <div class="flex flex-col md:flex-row gap-6">
        <USkeleton
          class="w-44 h-44 md:w-56 md:h-56 shrink-0 rounded"
        />
        <div class="flex flex-col justify-end flex-1 min-w-0 gap-3">
          <USkeleton class="h-10 w-full max-w-md" />
          <div class="flex flex-wrap gap-2">
            <USkeleton
              v-for="i in 4"
              :key="i"
              class="h-6 w-20 rounded-full"
            />
          </div>
          <div class="space-y-2">
            <USkeleton class="h-4 w-full" />
            <USkeleton class="h-4 w-4/5" />
          </div>
          <span class="flex-1" />
          <div class="flex flex-wrap items-center gap-3">
            <USkeleton class="h-9 w-24 rounded" />
            <USkeleton class="h-9 w-9 rounded" />
            <USkeleton class="h-9 w-9 rounded" />
          </div>
        </div>
      </div>
    </UCard>
    <template v-if="showAlbumGrid">
      <UCard v-for="type in 2" :key="type">
        <template #header>
          <div class="flex items-center justify-between">
            <USkeleton class="h-7 w-32" />
            <USkeleton class="h-5 w-24 rounded-full" />
          </div>
        </template>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          <div
            v-for="i in 6"
            :key="i"
            class="flex flex-col gap-2 p-3"
          >
            <USkeleton class="aspect-square w-full rounded-lg" />
            <USkeleton class="h-4 w-full" />
            <USkeleton class="h-3 w-3/4" />
            <USkeleton class="h-3 w-1/2" />
          </div>
        </div>
      </UCard>
    </template>
  </div>
</template>
