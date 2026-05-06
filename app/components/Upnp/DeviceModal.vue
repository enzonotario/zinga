<script setup lang="ts">
import { computed, ref } from 'vue';
import useDevices from '../../composables/useDevices';
import usePlayer from '../../composables/usePlayer';

const props = defineProps<{
  modelValue: boolean
}>();
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  close: []
}>();
const {
  loading,
  devices,
  selectedDeviceId,
  isLocalPlayback,
  discover,
  select,
  selectLocal,
} = useDevices();
const { testSound } = usePlayer();
const { t } = useI18n();
const expandedId = ref<string | null>(null);
const debugOpen = ref<Record<string, boolean>>({});
const isOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => {
    emit('update:modelValue', value);
    if (!value) {
      emit('close');
    }
  },
});
async function selectDevice(deviceId: string) {
  await select(deviceId);
  isOpen.value = false;
}
async function selectLocalPlayback() {
  await selectLocal();
  isOpen.value = false;
}
</script>

<template>
  <UPopover v-model="isOpen">
    <UButton
      icon="i-heroicons-magnifying-glass"
      size="sm"
      variant="outline"
    />
    <template #content>
      <UCard
        :ui="{
          body: 'max-h-[70vh] w-96 sm:w-112 overflow-y-auto',
        }"
      >
        <template #header>
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-lg font-semibold">
              {{ t('upnp.selectDevice') }}
            </h3>
            <UButton
              :label="loading ? t('pages.devices.searching') : t('upnp.searchDevices')"
              :disabled="loading"
              :loading="loading"
              icon="i-heroicons-magnifying-glass"
              size="sm"
              @click="discover"
            />
          </div>
        </template>
        <div class="space-y-4">
          <div class="space-y-2">
            <h4 class="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              {{ t('pages.devices.localPlayback') }}
            </h4>
            <div
              class="border rounded-lg p-3 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors flex items-center gap-3 cursor-pointer"
              :class="{
                'ring-2 ring-neutral-500 bg-neutral-50 dark:bg-neutral-950': isLocalPlayback,
              }"
              @click="selectLocalPlayback"
            >
              <UButton
                v-if="!isLocalPlayback"
                :label="t('common.select')"
                size="xs"
                variant="outline"
                @click.stop="selectLocalPlayback"
              />
              <div class="flex-1 min-w-0">
                <div class="font-medium truncate">
                  {{ t('pages.devices.localPlayback') }}
                </div>
                <div class="text-sm text-neutral-500 truncate">
                  {{ t('pages.devices.localPlaybackDescription') }}
                </div>
              </div>
              <UButton
                v-if="isLocalPlayback"
                icon="i-heroicons-play"
                size="xs"
                variant="ghost"
                @click.stop="testSound"
              />
            </div>
          </div>
          <USeparator />
          <div class="space-y-2">
            <h4 class="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              {{ t('pages.devices.upnpDevices') }}
            </h4>
            <ul v-if="devices.length > 0" class="space-y-2">
              <li
                v-for="device in devices"
                :key="device.id"
                class="border rounded-lg p-3 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors flex flex-col gap-3 cursor-pointer"
                :class="{
                  'ring-2 ring-neutral-500 bg-neutral-50 dark:bg-neutral-950': selectedDeviceId === device.id,
                }"
                @click="selectDevice(device.id)"
              >
                <div class="flex items-center gap-3">
                  <UButton
                    v-if="selectedDeviceId !== device.id"
                    :label="t('common.select')"
                    size="xs"
                    variant="outline"
                    @click.stop="selectDevice(device.id)"
                  />
                  <div class="flex-1 min-w-0">
                    <div class="font-medium truncate">
                      {{ device.name }}
                    </div>
                    <div class="text-sm text-neutral-500 truncate">
                      {{ device.ip || device.location || device.usn }}
                    </div>
                  </div>
                  <div class="flex items-center gap-1">
                    <UButton
                      v-if="selectedDeviceId === device.id"
                      icon="i-heroicons-play"
                      size="xs"
                      variant="ghost"
                      @click.stop="testSound"
                    />
                    <UButton
                      :label="expandedId === device.id ? t('common.hide') : t('common.details')"
                      size="xs"
                      variant="ghost"
                      @click.stop="expandedId = expandedId === device.id ? null : device.id"
                    />
                  </div>
                </div>
                <UCollapsible
                  :open="expandedId === device.id"
                >
                  <template #content>
                    <div class="flex flex-col gap-2">
                      <USeparator />
                      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-neutral-600">
                        <div><span class="font-semibold">ID:</span> {{ device.id }}</div>
                        <div v-if="device.usn">
                          <span class="font-semibold">USN:</span> {{ device.usn }}
                        </div>
                        <div v-if="device.ip">
                          <span class="font-semibold">IP:</span> {{ device.ip }}
                        </div>
                        <div v-if="device.location">
                          <span class="font-semibold">{{ t('pages.devices.location') }}:</span> {{ device.location }}
                        </div>
                      </div>
                      <UCollapsible
                        v-model:open="debugOpen[device.id]"
                        class="flex flex-col gap-2"
                      >
                        <UButton
                          :label="debugOpen[device.id] ? t('upnp.hideDebugJson') : t('upnp.showDebugJson')"
                          size="xs"
                          variant="ghost"
                          icon="i-heroicons-code-bracket"
                          class="w-full justify-start"
                          @click.stop="debugOpen[device.id] = !debugOpen[device.id]"
                        />
                        <template #content>
                          <UCard variant="subtle" class="p-2">
                            <pre class="text-xs overflow-x-auto">{{ JSON.stringify(device, null, 2) }}</pre>
                          </UCard>
                        </template>
                      </UCollapsible>
                    </div>
                  </template>
                </UCollapsible>
              </li>
            </ul>
            <UEmpty
              v-else-if="!loading"
              icon="i-heroicons-magnifying-glass"
              :title="t('upnp.noDevicesFound')"
              :description="t('upnp.noDevicesDescription')"
            />
            <UEmpty
              v-else
              icon="i-heroicons-arrow-path"
              :title="t('upnp.searchingDevices')"
              :description="t('upnp.searchingDescription')"
            />
          </div>
        </div>
        <template #footer>
          <div class="flex justify-end">
            <UButton
              :label="t('common.close')"
              variant="ghost"
              @click="isOpen = false"
            />
          </div>
        </template>
      </UCard>
    </template>
  </UPopover>
</template>
