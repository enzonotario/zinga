<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import useTidalPlayback, { TIDAL_LOGIN_EXPIRED, TIDAL_LOGIN_INVALID_URL } from '~/composables/useTidalPlayback';
import useYoutubeMusic from '~/composables/useYoutubeMusic';

interface ErrorMessage {
  title: string
  description?: string
}

const { t } = useI18n();
const { status, refresh, startLogin, completeLogin, logout } = useTidalPlayback();
const ytm = useYoutubeMusic();
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

async function handleYtmConnect() {
  ytm.error.value = null;
  try {
    await ytm.importFromBrowser();
  } catch {
    // error text is already set on the composable
  }
}

async function handleYtmImportFile() {
  ytm.error.value = null;
  try {
    await ytm.importFromFile();
  } catch {
    // error text is already set on the composable
  }
}

async function handleYtmDisconnect() {
  ytm.error.value = null;
  try {
    await ytm.logout();
  } catch {
    // error text is already set on the composable
  }
}

async function handleYtdlpUpdate() {
  ytm.error.value = null;
  try {
    await ytm.updateYtdlp();
  } catch {
    // error text is already set on the composable
  }
}

onMounted(() => {
  refresh().catch((err) => {
    error.value = { title: errorText(err) };
  });
  ytm.refresh().catch(() => {
    // error text is already set on the composable
  });
});
</script>

<template>
  <div class="flex flex-col gap-6">
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

    <SettingsGroup
      icon="i-simple-icons-youtubemusic"
      :title="t('pages.settings.ytmPlayback')"
      :description="t('pages.settings.ytmPlaybackDescription')"
    >
      <p class="text-sm text-(--ui-text-muted)">
        {{ t('pages.settings.ytmPlaybackNote') }}
      </p>
      <div class="flex items-center gap-2">
        <UBadge
          :color="ytm.status.value.connected ? 'success' : 'neutral'"
          variant="subtle"
          :label="ytm.status.value.connected ? t('pages.settings.connected') : t('pages.settings.disconnected')"
        />
        <span
          v-if="ytm.status.value.connected && ytm.status.value.browser"
          class="text-sm text-(--ui-text-muted)"
        >
          {{ t('pages.settings.ytmBrowserLabel', { browser: ytm.status.value.browser }) }}
        </span>
      </div>
      <UAlert
        v-if="ytm.error.value"
        color="error"
        :title="t('pages.settings.ytmError')"
        :description="ytm.error.value"
      />
      <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
        <UFormField :label="t('pages.settings.ytmBrowserSelect')" class="sm:min-w-48">
          <USelect
            v-model="ytm.selectedBrowser.value"
            :items="ytm.browserItems.value"
            label-key="label"
            value-key="value"
            class="w-full"
          />
        </UFormField>
        <UButton
          icon="i-heroicons-arrow-right-on-rectangle"
          :loading="ytm.importing.value"
          @click="handleYtmConnect"
        >
          {{ t('pages.settings.ytmConnect') }}
        </UButton>
      </div>
      <p class="text-xs text-(--ui-text-muted)">
        {{ t('pages.settings.ytmConnectHint') }}
      </p>
      <div class="flex flex-wrap gap-2">
        <UButton
          icon="i-heroicons-document-arrow-up"
          variant="ghost"
          :loading="ytm.importing.value"
          @click="handleYtmImportFile"
        >
          {{ t('pages.settings.ytmImportFile') }}
        </UButton>
        <UButton
          v-if="ytm.status.value.connected"
          icon="i-heroicons-arrow-left-on-rectangle"
          variant="ghost"
          :loading="ytm.importing.value"
          @click="handleYtmDisconnect"
        >
          {{ t('pages.settings.ytmDisconnect') }}
        </UButton>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-sm text-(--ui-text-muted)">
          {{
            ytm.status.value.ytdlpVersion
              ? t('pages.settings.ytmYtdlpVersion', { version: ytm.status.value.ytdlpVersion })
              : t('pages.settings.ytmYtdlpMissing')
          }}
        </span>
        <UButton
          icon="i-heroicons-arrow-path"
          variant="ghost"
          :loading="ytm.updating.value"
          @click="handleYtdlpUpdate"
        >
          {{ t('pages.settings.ytmYtdlpUpdate') }}
        </UButton>
      </div>
    </SettingsGroup>
  </div>
</template>
