<script lang="ts" setup>
const { t } = useI18n();
const { status, loading, error, checkSystem } = useSystemSetup();

onMounted(() => {
  if (!status.value) checkSystem();
});
</script>

<template>
  <div class="flex flex-col gap-4">
    <SystemDependencyList v-if="status" :status="status" />
    <div v-else-if="loading" class="text-sm text-(--ui-text-muted)">
      {{ t('pages.setup.checking') }}
    </div>
    <UAlert v-if="error" color="error" :title="error" />
    <div>
      <UButton
        size="sm"
        icon="i-heroicons-arrow-path"
        variant="ghost"
        :loading="loading"
        @click="checkSystem()"
      >
        {{ t('pages.setup.recheck') }}
      </UButton>
    </div>
    <NuxtLink to="/setup" class="text-sm text-primary hover:underline">
      {{ t('pages.setup.goToSetup') }}
    </NuxtLink>
  </div>
</template>
