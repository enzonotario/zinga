<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import useTidalPlayback, { TIDAL_LOGIN_EXPIRED, TIDAL_LOGIN_INVALID_URL } from '~/composables/useTidalPlayback';

interface ErrorMessage {
  title: string
  description?: string
}

const { t } = useI18n();
const { status, refresh, startLogin, completeLogin, logout } = useTidalPlayback();
const loginStarted = ref(false);
const redirectUrl = ref('');
const opening = ref(false);
const completing = ref(false);
const disconnecting = ref(false);
const error = ref<ErrorMessage | null>(null);

function errorText(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

function loginError(raw: string | null): ErrorMessage {
  if (raw === TIDAL_LOGIN_INVALID_URL) return { title: t('pages.settings.tidalPlaybackInvalidUrl') };
  if (raw === TIDAL_LOGIN_EXPIRED) return { title: t('pages.settings.tidalPlaybackExpired') };
  return { title: t('pages.settings.tidalPlaybackLoginError'), description: raw ?? undefined };
}

async function handleOpen() {
  opening.value = true;
  error.value = null;
  try {
    await startLogin();
    loginStarted.value = true;
  } catch (err) {
    error.value = loginError(errorText(err));
  } finally {
    opening.value = false;
  }
}

async function handleComplete() {
  completing.value = true;
  error.value = null;
  try {
    const result = await completeLogin(redirectUrl.value);
    if (!result.ok) {
      error.value = loginError(result.error);
      return;
    }
    loginStarted.value = false;
    redirectUrl.value = '';
  } finally {
    completing.value = false;
  }
}

async function handleDisconnect() {
  disconnecting.value = true;
  error.value = null;
  try {
    await logout();
  } catch (err) {
    error.value = { title: errorText(err) };
  } finally {
    disconnecting.value = false;
  }
}

onMounted(() => {
  refresh().catch((err) => {
    error.value = { title: errorText(err) };
  });
});
</script>

<template>
  <SettingsGroup
    icon="i-heroicons-play-circle"
    :title="t('pages.settings.tidalPlayback')"
    :description="t('pages.settings.tidalPlaybackDescription')"
  >
    <p class="text-sm text-(--ui-text-muted)">
      {{ t('pages.settings.tidalPlaybackNote') }}
    </p>
    <div class="flex items-center gap-2">
      <UBadge
        :color="status.loggedIn ? 'success' : 'neutral'"
        variant="subtle"
        :label="status.loggedIn ? t('pages.settings.connected') : t('pages.settings.disconnected')"
      />
      <span v-if="status.loggedIn && status.countryCode" class="text-sm text-(--ui-text-muted)">
        {{ t('pages.settings.tidalPlaybackCountry', { country: status.countryCode }) }}
      </span>
    </div>
    <UAlert v-if="error" color="error" :title="error.title" :description="error.description" />
    <div v-if="status.loggedIn" class="flex gap-2">
      <UButton
        icon="i-heroicons-arrow-left-on-rectangle"
        variant="ghost"
        :loading="disconnecting"
        @click="handleDisconnect"
      >
        {{ t('pages.settings.tidalPlaybackDisconnect') }}
      </UButton>
    </div>
    <template v-else>
      <div v-if="!loginStarted" class="flex gap-2">
        <UButton
          icon="i-heroicons-arrow-right-on-rectangle"
          :loading="opening"
          @click="handleOpen"
        >
          {{ t('pages.settings.tidalPlaybackConnect') }}
        </UButton>
      </div>
      <form v-else class="flex flex-col gap-3" @submit.prevent="handleComplete">
        <ol class="list-decimal space-y-1 pl-5 text-sm">
          <li>{{ t('pages.settings.tidalPlaybackStepLogin') }}</li>
          <li>{{ t('pages.settings.tidalPlaybackStepOops') }}</li>
          <li>{{ t('pages.settings.tidalPlaybackStepPaste') }}</li>
        </ol>
        <UInput
          v-model="redirectUrl"
          class="w-full"
          :placeholder="t('pages.settings.tidalPlaybackRedirectPlaceholder')"
        />
        <div class="flex gap-2">
          <UButton
            type="submit"
            icon="i-heroicons-check"
            :loading="completing"
            :disabled="!redirectUrl.trim()"
          >
            {{ t('pages.settings.tidalPlaybackComplete') }}
          </UButton>
          <UButton
            icon="i-heroicons-arrow-top-right-on-square"
            variant="ghost"
            :loading="opening"
            @click="handleOpen"
          >
            {{ t('pages.settings.tidalPlaybackReopen') }}
          </UButton>
        </div>
      </form>
    </template>
  </SettingsGroup>
</template>
