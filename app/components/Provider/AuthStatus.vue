<script lang="ts" setup>
import useProvider from '~/composables/useProvider';

const provider = useProvider();
const showLoginModal = ref(false);
const checkInterval = setInterval(() => {
  if (provider.isInitialized.value) {
    provider.init();
  }
}, 30000);
onUnmounted(() => {
  clearInterval(checkInterval);
});
function handleLoginClick() {
  if (provider.isUserLoggedIn.value) {
    return;
  }
  showLoginModal.value = true;
}
function onLoginSuccess() {
  showLoginModal.value = false;
}
function handleLogout() {
  provider.logout();
}
</script>

<template>
  <div class="flex items-center gap-2">
    <UButton
      v-if="!provider.isUserLoggedIn.value"
      icon="i-heroicons-user"
      variant="soft"
      size="sm"
      :loading="provider.isLoading.value"
      @click="handleLoginClick"
    >
      <span class="hidden md:inline">
        {{ $t('auth.login') }}
      </span>
    </UButton>
    <UPopover
      v-else
      :popper="{ placement: 'bottom-end' }"
    >
      <UButton
        icon="i-heroicons-user-circle"
        color="success"
        variant="ghost"
        size="sm"
      >
        <span class="hidden md:inline">
          {{ $t('auth.connected') }}
        </span>
      </UButton>
      <template #content>
        <div class="p-4 w-64 flex flex-col gap-4">
          <div class="flex items-center gap-2">
            <UIcon
              name="i-heroicons-check-circle"
              class="w-5 h-5 text-green-500"
            />
            <h3 class="font-semibold text-sm">
              {{ $t('auth.session', { provider: provider.providerName }) }}
            </h3>
          </div>
          <div class="space-y-2">
            <div class="flex items-center justify-between text-sm">
              <span class="text-muted">{{ $t('common.status') }}:</span>
              <UBadge
                color="success"
                variant="subtle"
                size="xs"
              >
                {{ $t('auth.connected') }}
              </UBadge>
            </div>
          </div>
          <UButton
            block
            variant="soft"
            color="error"
            icon="i-heroicons-arrow-right-on-rectangle"
            @click="handleLogout"
          >
            {{ $t('auth.logout') }}
          </UButton>
        </div>
      </template>
    </UPopover>
    <UModal v-model:open="showLoginModal">
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold">
                {{ $t('auth.loginTo', { provider: provider.providerName }) }}
              </h3>
              <UButton
                icon="i-heroicons-x-mark"
                variant="ghost"
                size="sm"
                @click="showLoginModal = false"
              />
            </div>
          </template>
          <ProviderDeviceLogin
            @success="onLoginSuccess"
            @cancel="showLoginModal = false"
          />
        </UCard>
      </template>
    </UModal>
  </div>
</template>
