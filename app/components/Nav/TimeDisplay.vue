<script setup lang="ts">
interface Props {
  position: string
  duration: string
  hasTrack: boolean
}
defineProps<Props>();
</script>

<template>
  <UBadge
    v-if="hasTrack"
    variant="subtle"
    class="whitespace-nowrap font-mono"
  >
    {{ position }} / {{ duration }}
  </UBadge>
</template>
