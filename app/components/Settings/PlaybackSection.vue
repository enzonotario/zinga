<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import useTidalPlayback, { TIDAL_LOGIN_CANCELLED } from '~/composables/useTidalPlayback';

const { t } = useI18n();
const { status, refresh, login, logout } = useTidalPlayback();
const connecting = ref(false);
const disconnecting = ref(false);
const error = ref<string | null>(null);

async function handleConnect() {
  connecting.value = true;
  error.value = null;
  try {
    const result = await login();
    if (!result.ok && result.error !== TIDAL_LOGIN_CANCELLED) {
      error.value = result.error || t('pages.settings.tidalPlaybackLoginError');
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    connecting.value = false;
  }
}

async function handleDisconnect() {
  disconnecting.value = true;
  error.value = null;
  try {
    await logout();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    disconnecting.value = false;
  }
}

onMounted(() => {
  refresh().catch((err) => {
    error.value = err instanceof Error ? err.message : String(err);
  });
});
</script>

<template>
  <SettingsGroup
    icon="i-heroicons-play-circle"
    :title="t('pages.settings.tidalPlayback')"
    :description="t('pages.settings.tidalPlaybackDescription')"
  >
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
    <UAlert v-if="error" color="error" :title="error" />
    <div class="flex gap-2">
      <UButton
        v-if="!status.loggedIn"
        icon="i-heroicons-arrow-right-on-rectangle"
        :loading="connecting"
        @click="handleConnect"
      >
        {{ t('pages.settings.tidalPlaybackConnect') }}
      </UButton>
      <UButton
        v-else
        icon="i-heroicons-arrow-left-on-rectangle"
        variant="ghost"
        :loading="disconnecting"
        @click="handleDisconnect"
      >
        {{ t('pages.settings.tidalPlaybackDisconnect') }}
      </UButton>
    </div>
  </SettingsGroup>
</template>
