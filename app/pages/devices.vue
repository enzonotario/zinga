<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import useDevices from '~/composables/useDevices';
import usePlayer from '~/composables/usePlayer';
import { useSettings } from '~/composables/useSettings';

definePageMeta({
  name: 'devices',
  nameKey: 'pages.devices.name',
  icon: 'lucide:radio-receiver',
  category: 'main',
  descriptionKey: 'pages.devices.description',
});
const {
  loading,
  devices,
  selectedDeviceId,
  services,
  volume,
  error,
  selectedDevice,
  isLocalPlayback,
  discover,
  select,
  selectLocal,
  setVolume,
  decreaseVolume,
  increaseVolume,
  pauseVolumePolling,
  resumeVolumePolling,
} = useDevices();
const { testSound, pause } = usePlayer();
const { debugMode } = useSettings();
const { t } = useI18n();
const expandedId = ref<string | null>(null);
const debugDevice = ref<any>(null);
onMounted(() => {
  discover();
});
</script>

<template>
  <div class="py-8">
    <UCard>
      <template #header>
        <div class="flex flex-col gap-4">
          <div class="flex items-center justify-between">
            <div>
              <h1 class="text-xl font-semibold">
                {{ t('pages.devices.title') }}
              </h1>
              <p class="text-sm text-neutral-500 mt-1">
                {{ t('pages.devices.subtitle') }}
              </p>
            </div>
            <UButton
              :label="loading ? t('pages.devices.searching') : t('pages.devices.search')"
              :disabled="loading"
              :loading="loading"
              icon="i-heroicons-magnifying-glass"
              size="sm"
              @click="discover"
            />
          </div>
          <UAlert
            v-if="error"
            icon="i-heroicons-exclamation-triangle"
            color="error"
            variant="subtle"
            :title="error"
          />
        </div>
      </template>
      <div class="flex flex-col gap-6">
        <div class="flex flex-col gap-3">
          <h2 class="font-medium flex items-center gap-2">
            <UIcon name="i-heroicons-computer-desktop" />
            {{ t('pages.devices.localPlayback') }}
          </h2>
          <UCard
            :ui="{ body: { padding: 'p-3 sm:p-3' } }"
            class="hover:ring-2 hover:ring-primary-500/50 transition-all cursor-pointer"
            :class="{ 'ring-2 ring-primary-500': isLocalPlayback }"
            @click="selectLocal()"
          >
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-3">
                <UAvatar
                  :alt="t('common.local')"
                  icon="i-heroicons-computer-desktop"
                  size="sm"
                  class="bg-primary-500/10 text-primary-500"
                />
                <div class="flex flex-col">
                  <span class="font-medium text-sm">{{ t('pages.devices.localPlayback') }}</span>
                  <span class="text-xs text-neutral-500">{{ t('pages.devices.localPlaybackDescription') }}</span>
                </div>
              </div>
              <UButton
                v-if="!isLocalPlayback"
                :label="t('common.select')"
                size="xs"
                variant="soft"
                @click.stop="selectLocal()"
              />
            </div>
          </UCard>
        </div>
        <USeparator />
        <div class="flex flex-col gap-3">
          <h2 class="font-medium flex items-center gap-2">
            <UIcon name="i-heroicons-list-bullet" />
            {{ t('pages.devices.upnpDevices') }}
          </h2>
          <div v-if="!loading && devices.length === 0">
            <UEmpty
              icon="i-heroicons-wifi"
              :title="t('pages.devices.noDevicesFound')"
              :description="t('pages.devices.noDevicesDescription')"
            />
          </div>
          <div v-else class="flex flex-col gap-2">
            <UCard
              v-for="d in devices"
              :key="d.id"
              :ui="{ body: { padding: 'p-3 sm:p-3' } }"
              class="hover:ring-2 hover:ring-primary-500/50 transition-all cursor-pointer"
              :class="{ 'ring-2 ring-primary-500': selectedDeviceId === d.id }"
              @click="select(d.id)"
            >
              <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-3">
                    <UAvatar
                      :alt="d.name"
                      :src="d.iconUrl"
                      icon="i-heroicons-speaker-wave"
                      size="sm"
                      class="bg-primary-500/10 text-primary-500"
                    />
                    <div class="flex flex-col">
                      <span class="font-medium text-sm">{{ d.name }}</span>
                      <span class="text-xs text-neutral-500">{{ d.ip || d.location || d.usn }}</span>
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <UButton
                      v-if="selectedDeviceId !== d.id"
                      :label="t('common.select')"
                      size="xs"
                      variant="soft"
                      @click.stop="select(d.id)"
                    />
                    <UButton
                      :icon="expandedId === d.id ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
                      variant="ghost"
                      size="xs"
                      @click.stop="expandedId = expandedId === d.id ? null : d.id"
                    />
                  </div>
                </div>
                <div v-if="expandedId === d.id" class="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 text-xs text-neutral-600 space-y-1">
                  <div class="grid grid-cols-[80px_1fr] gap-1">
                    <span class="font-semibold">ID:</span> <span class="truncate">{{ d.id }}</span>
                    <template v-if="d.usn">
                      <span class="font-semibold">USN:</span> <span class="truncate">{{ d.usn }}</span>
                    </template>
                    <template v-if="d.ip">
                      <span class="font-semibold">IP:</span> <span>{{ d.ip }}</span>
                    </template>
                    <template v-if="d.location">
                      <span class="font-semibold">Loc:</span> <span class="truncate">{{ d.location }}</span>
                    </template>
                    <template v-if="d.manufacturer">
                      <span class="font-semibold">{{ t('pages.devices.manufacturer') }}:</span> <span class="truncate">{{ d.manufacturer }}</span>
                    </template>
                    <template v-if="d.modelName">
                      <span class="font-semibold">{{ t('pages.devices.model') }}:</span> <span class="truncate">{{ d.modelName }}</span>
                    </template>
                    <template v-if="d.modelNumber">
                      <span class="font-semibold">{{ t('pages.devices.modelNumber') }}:</span> <span class="truncate">{{ d.modelNumber }}</span>
                    </template>
                    <template v-if="d.serialNumber">
                      <span class="font-semibold">{{ t('pages.devices.serial') }}:</span> <span class="truncate">{{ d.serialNumber }}</span>
                    </template>
                    <template v-if="d.deviceType">
                      <span class="font-semibold">{{ t('pages.devices.deviceType') }}:</span> <span class="truncate">{{ d.deviceType }}</span>
                    </template>
                  </div>
                  <UButton
                    v-if="debugMode"
                    :label="t('common.debug')"
                    icon="i-heroicons-code-bracket"
                    size="xs"
                    variant="soft"
                    class="mt-2"
                    @click.stop="debugDevice = d"
                  />
                </div>
              </div>
            </UCard>
          </div>
        </div>
        <USeparator />
        <div v-if="selectedDeviceId" class="flex flex-col gap-4">
          <div class="flex items-center justify-between">
            <h2 class="font-medium flex items-center gap-2">
              <UIcon name="i-heroicons-adjustments-horizontal" />
              {{ t('pages.devices.control', { name: isLocalPlayback ? t('pages.devices.localPlayback') : selectedDevice?.name }) }}
            </h2>
            <UBadge
              v-if="!isLocalPlayback && selectedDevice?.ip"
              variant="outline"
              size="xs"
              :label="selectedDevice.ip"
            />
          </div>
          <div class="flex flex-col gap-4">
            <div v-if="!isLocalPlayback && services.length" class="flex flex-wrap gap-2">
              <UBadge
                v-for="s in services"
                :key="s"
                variant="subtle"
                size="sm"
                :label="s"
              />
            </div>
            <div v-if="volume !== null" class="h-10">
              <UiVolumeControl
                :volume="volume"
                :selected-device-id="selectedDeviceId"
                @update:volume="setVolume"
                @decrease="decreaseVolume"
                @increase="increaseVolume"
                @pause-polling="pauseVolumePolling"
                @resume-polling="resumeVolumePolling"
              />
            </div>
            <div v-else-if="!isLocalPlayback" class="flex items-center gap-4 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg text-sm text-neutral-500">
              <UIcon name="i-heroicons-speaker-x-mark" />
              {{ t('pages.devices.volumeNotAvailable') }}
            </div>
            <div class="flex items-center gap-2">
              <UButton
                :label="t('pages.devices.testSound')"
                icon="i-heroicons-play"
                size="sm"
                @click="testSound"
              />
              <UButton
                :label="t('pages.devices.pause')"
                icon="i-heroicons-pause"
                size="sm"
                variant="soft"
                @click="pause"
              />
            </div>
          </div>
        </div>
      </div>
    </UCard>
    <UModal
      v-if="debugMode"
      :open="!!debugDevice"
      :title="`${t('common.debug')}: ${debugDevice?.name}`"
      @update:open="(val: boolean) => { if (!val) debugDevice = null }"
    >
      <template #body>
        <pre class="text-xs overflow-auto max-h-96 p-2 bg-gray-50 dark:bg-gray-900 rounded">{{ JSON.stringify(debugDevice, null, 2) }}</pre>
      </template>
    </UModal>
  </div>
</template>
