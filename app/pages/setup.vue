<script lang="ts" setup>
import { NO_NAV_CATEGORY } from '~/composables/pages';

definePageMeta({
  name: 'setup',
  nameKey: 'pages.setup.name',
  icon: 'i-heroicons-wrench-screwdriver',
  category: NO_NAV_CATEGORY,
  descriptionKey: 'pages.setup.description',
});
const { t } = useI18n();
const { status, loading, error, checkSystem } = useSystemSetup();

onMounted(() => checkSystem());
</script>

<template>
  <div class="min-h-full py-8">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-2">
          <h1 class="text-lg font-medium">
            {{ t('pages.setup.title') }}
          </h1>
          <UBadge v-if="status" :color="status.ready ? 'success' : 'warning'" variant="subtle">
            {{ status.ready ? t('pages.setup.allGood') : t('pages.setup.issuesFound') }}
          </UBadge>
        </div>
      </template>
      <div class="flex flex-col gap-6">
        <p class="text-sm text-(--ui-text-muted)">
          {{ t('pages.setup.intro') }}
        </p>
        <SystemDependencyList v-if="status" :status="status" />
        <UAlert v-if="error" color="error" :title="error" />
        <div>
          <UButton
            icon="i-heroicons-arrow-path"
            variant="ghost"
            :loading="loading"
            @click="checkSystem"
          >
            {{ loading ? t('pages.setup.checking') : t('pages.setup.recheck') }}
          </UButton>
        </div>
      </div>
    </UCard>
  </div>
</template>
