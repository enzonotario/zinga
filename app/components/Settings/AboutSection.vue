<script lang="ts" setup>
const { app } = useAppConfig();
const { public: publicConfig } = useRuntimeConfig();
const colorMode = useColorMode();
const { openExternalLink } = useOpenExternalLink();
</script>

<template>
  <div class="flex flex-col justify-center gap-6 min-h-full">
    <div class="flex flex-col items-center gap-6">
      <div class="flex items-center gap-4">
        <UAvatar
          :icon="colorMode.value === 'dark' ? 'local:logo-white' : 'local:logo-black'"
          :alt="app.name"
          :ui="{
            root: 'size-14',
            icon: 'size-14',
          }"
          class="bg-transparent"
        />
        <div>
          <h3 class="text-2xl font-bold">
            {{ app.name }}
          </h3>
          <p class="text-sm text-(--ui-text-muted)">
            {{ app.description }}
          </p>
        </div>
      </div>
    </div>
    <div class="flex justify-center items-center gap-8 flex-wrap">
      <div class="flex justify-center items-center gap-1 text-sm">
        <p class="font-medium text-(--ui-text-muted)">
          {{ $t('pages.about.appVersion') }}
        </p>
        <p class="font-semibold">
          v{{ publicConfig.appVersion }}
        </p>
      </div>
    </div>
    <div class="flex justify-center items-center gap-4">
      <UButton
        v-if="app.repo"
        size="sm"
        icon="i-carbon-logo-github"
        @click="openExternalLink(app.repo)"
      >
        {{ $t('pages.about.viewOnGithub') }}
      </UButton>
      <UButton
        v-if="app.sponsorUrl"
        size="sm"
        icon="i-heroicons-heart"
        @click="openExternalLink(app.sponsorUrl)"
      >
        {{ $t('pages.about.sponsorProject') }}
      </UButton>
    </div>
  </div>
</template>
