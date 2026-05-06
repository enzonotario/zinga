<script lang="ts" setup>
import { onUnmounted, ref } from 'vue';
import useOpenExternalLink from '~/composables/useOpenExternalLink';
import useProvider from '~/composables/useProvider';

const emit = defineEmits<{
  (e: 'success'): void
  (e: 'cancel'): void
}>();
const { t } = useI18n();
const { openExternalLink } = useOpenExternalLink();
const provider = useProvider();
const step = ref<'idle' | 'waiting' | 'success' | 'error'>('idle');
const errorMessage = ref<string | null>(null);
const pollingTimeout: ReturnType<typeof setTimeout> | null = null;
async function startLogin() {
  try {
    step.value = 'waiting';
    errorMessage.value = null;
    await provider.startDeviceLogin();
    pollForCompletion();
  } catch (err) {
    step.value = 'error';
    errorMessage.value = err instanceof Error ? err.message : t('auth.loginError');
  }
}
async function pollForCompletion() {
  try {
    await provider.completeDeviceLogin();
    step.value = 'success';
    emit('success');
  } catch (err) {
    step.value = 'error';
    errorMessage.value = err instanceof Error ? err.message : t('auth.loginError');
  }
}
function cancel() {
  if (pollingTimeout) {
    clearTimeout(pollingTimeout);
  }
  provider.cancelDeviceLogin();
  step.value = 'idle';
  emit('cancel');
}
function retry() {
  step.value = 'idle';
  errorMessage.value = null;
}
onUnmounted(() => {
  if (pollingTimeout) {
    clearTimeout(pollingTimeout);
  }
});
</script>

<template>
  <div class="space-y-4">
    <template v-if="step === 'idle'">
      <div class="text-center space-y-4">
        <UIcon name="i-heroicons-user-circle" class="w-16 h-16 mx-auto text-primary" />
        <h3 class="text-lg font-semibold">
          {{ $t('auth.loginTo', { provider: provider.providerName }) }}
        </h3>
        <p class="text-sm text-muted">
          {{ $t('auth.loginDescription') }}
        </p>
        <UButton
          size="lg"
          @click="startLogin"
        >
          {{ $t('auth.login') }}
        </UButton>
      </div>
    </template>
    <template v-else-if="step === 'waiting' && provider.deviceLoginInfo.value">
      <div class="text-center space-y-4">
        <UIcon name="i-heroicons-device-phone-mobile" class="w-16 h-16 mx-auto text-primary animate-pulse" />
        <h3 class="text-lg font-semibold">
          {{ $t('auth.completeLogin') }}
        </h3>
        <p class="text-sm text-muted">
          {{ $t('auth.completeLoginDescription') }}
        </p>
        <div class="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-4 space-y-3">
          <div class="text-3xl font-mono font-bold tracking-widest text-primary">
            {{ provider.deviceLoginInfo.value.userCode }}
          </div>
          <UButton
            @click="openExternalLink(`https://${provider.deviceLoginInfo.value.verificationUriComplete}`)"
          >
            https://{{ provider.deviceLoginInfo.value.verificationUri }}
            <UIcon name="i-heroicons-arrow-top-right-on-square" class="w-4 h-4" />
          </UButton>
        </div>
        <div class="flex items-center justify-center gap-2 text-sm text-muted">
          <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
          <span>{{ $t('auth.waitingConfirmation') }}</span>
        </div>
        <UButton
          variant="ghost"
          @click="cancel"
        >
          {{ $t('common.cancel') }}
        </UButton>
      </div>
    </template>
    <template v-else-if="step === 'success'">
      <div class="text-center space-y-4">
        <UIcon name="i-heroicons-check-circle" class="w-16 h-16 mx-auto text-success" />
        <h3 class="text-lg font-semibold text-success">
          {{ $t('auth.loginSuccess') }}
        </h3>
        <p class="text-sm text-muted">
          {{ $t('auth.loginSuccessDescription') }}
        </p>
      </div>
    </template>
    <template v-else-if="step === 'error'">
      <div class="text-center space-y-4">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-16 h-16 mx-auto text-error" />
        <h3 class="text-lg font-semibold text-error">
          {{ $t('auth.loginError') }}
        </h3>
        <p class="text-sm text-muted">
          {{ errorMessage || $t('auth.unexpectedError') }}
        </p>
        <div class="flex items-center justify-center gap-2">
          <UButton
            variant="ghost"
            @click="cancel"
          >
            {{ $t('common.cancel') }}
          </UButton>
          <UButton
            @click="retry"
          >
            {{ $t('common.retry') }}
          </UButton>
        </div>
      </div>
    </template>
    <template v-else>
      <div class="flex items-center justify-center py-8">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary" />
      </div>
    </template>
  </div>
</template>
