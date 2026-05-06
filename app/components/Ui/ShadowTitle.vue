<script lang="ts" setup>
import type { RouteLocationRaw } from 'vue-router';

interface Props {
  text: string
  to?: RouteLocationRaw
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'span' | 'p'
}
const props = withDefaults(defineProps<Props>(), {
  size: 'lg',
  as: 'h1',
});
const sizeClasses: Record<NonNullable<Props['size']>, string> = {
  xs: 'text-sm md:text-base',
  sm: 'text-base md:text-lg',
  md: 'text-lg md:text-xl',
  lg: 'text-xl md:text-2xl',
  xl: 'text-2xl md:text-3xl',
};
const textClass = computed(() => sizeClasses[props.size]);
const darkShadow = '0 0 6px rgba(0, 0, 0, 0.6), 0 0 12px rgba(0, 0, 0, 0.5), 0 1px 3px rgba(0, 0, 0, 0.4)';
const lightShadow = '0 0 6px rgba(255, 255, 255, 0.7), 0 0 12px rgba(255, 255, 255, 0.6), 0 1px 3px rgba(255, 255, 255, 0.5)';
</script>

<template>
  <component
    :is="as"
    class="font-semibold shadow-title"
    :class="textClass"
  >
    <NuxtLink
      v-if="to"
      :to="to"
      class="text-gray-900 dark:text-white hover:text-primary transition-colors"
    >
      {{ text }}
    </NuxtLink>
    <span v-else class="text-gray-900 dark:text-white">{{ text }}</span>
  </component>
</template>

<style scoped>
.shadow-title {
  text-shadow: v-bind(lightShadow);
}
:root.dark .shadow-title,
.dark .shadow-title {
  text-shadow: v-bind(darkShadow);
}
@media (prefers-color-scheme: dark) {
  :root:not(.light) .shadow-title {
    text-shadow: v-bind(darkShadow);
  }
}
</style>
