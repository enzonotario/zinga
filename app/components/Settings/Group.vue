<script lang="ts" setup>
interface Props {
  icon: string
  title: string
  description?: string
}
defineProps<Props>();
</script>

<template>
  <section class="flex flex-col gap-4 py-6 first:pt-0 last:pb-0">
    <div class="flex flex-col gap-1">
      <div class="flex items-center gap-2">
        <UIcon :name="icon" class="size-5 text-muted" />
        <h3 class="text-sm font-semibold">
          {{ title }}
        </h3>
      </div>
      <p v-if="description" class="text-sm text-muted">
        {{ description }}
      </p>
    </div>
    <slot />
  </section>
</template>
