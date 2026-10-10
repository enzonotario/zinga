<script setup lang="ts">
import type { UnlistenFn } from '@tauri-apps/api/event';
import type { WTerm } from '@wterm/vue';
import type { TerminalExitEvent, TerminalOutputEvent } from '~/composables/useTerminalPanel';
import { Terminal } from '@wterm/vue';
import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import useSystemSetup from '~/composables/useSystemSetup';
import useTerminalPanel from '~/composables/useTerminalPanel';
import '@wterm/vue/css';

const { t } = useI18n();
const terminalPanel = useTerminalPanel();
const { sessionId, running, exitCode, error } = terminalPanel;
const { checkSystem } = useSystemSetup();

let unlisteners: UnlistenFn[] = [];
let unmounted = false;

const statusLabel = computed(() => {
  if (running.value) return t('terminal.running');
  if (exitCode.value === null) return t('terminal.finished');
  return t('terminal.finishedWithCode', { code: exitCode.value });
});
const statusColor = computed(() => {
  if (running.value) return 'info' as const;
  return exitCode.value === 0 ? 'success' as const : 'error' as const;
});

function onTerminalReady(instance: WTerm) {
  terminalPanel.attach((data) => instance.write(data));
  instance.focus();
}

function onTerminalError(err: unknown) {
  error.value = err instanceof Error ? err.message : String(err);
  console.error('Terminal init error:', err);
}

onMounted(async () => {
  const { listen } = await import('@tauri-apps/api/event');
  const registered = await Promise.all([
    listen<TerminalOutputEvent>('terminal-output', ({ payload }) => terminalPanel.handleOutput(payload)),
    listen<TerminalExitEvent>('terminal-exit', ({ payload }) => terminalPanel.handleExit(payload)),
  ]);
  if (unmounted) {
    registered.forEach((unlisten) => unlisten());
    return;
  }
  unlisteners = registered;
});

onBeforeUnmount(() => {
  unmounted = true;
  terminalPanel.detach();
  unlisteners.forEach((unlisten) => unlisten());
  unlisteners = [];
});

watch(exitCode, (code) => {
  if (code === 0) checkSystem();
});
</script>

<template>
  <div v-if="sessionId" class="px-2 pb-2">
    <div class="glass ring ring-default rounded-xl overflow-hidden">
      <div class="flex items-center justify-between gap-3 px-3 py-1.5">
        <div class="flex items-center gap-2 min-w-0">
          <UIcon name="i-heroicons-command-line" class="w-4 h-4 text-primary shrink-0" />
          <span class="text-xs font-medium truncate">{{ t('terminal.title') }}</span>
          <UBadge :color="statusColor" variant="subtle" size="sm">
            {{ statusLabel }}
          </UBadge>
        </div>
        <div class="flex items-center gap-1">
          <UButton
            v-if="running"
            icon="i-heroicons-stop"
            variant="ghost"
            color="error"
            size="xs"
            :aria-label="t('terminal.kill')"
            @click="terminalPanel.kill()"
          >
            {{ t('terminal.kill') }}
          </UButton>
          <UButton
            icon="i-heroicons-x-mark"
            variant="ghost"
            size="xs"
            :aria-label="t('terminal.close')"
            @click="terminalPanel.close()"
          />
        </div>
      </div>
      <div class="terminal-shell px-2 pb-2">
        <Terminal
          :key="sessionId"
          class="h-full rounded-lg"
          data-selectable
          :cols="100"
          :rows="30"
          auto-resize
          cursor-blink
          @data="terminalPanel.write"
          @resize="terminalPanel.resize"
          @ready="onTerminalReady"
          @error="onTerminalError"
        />
      </div>
      <UAlert
        v-if="error"
        color="error"
        variant="soft"
        :title="error"
        class="mx-2 mb-2"
      />
    </div>
  </div>
</template>

<style scoped>
.terminal-shell {
  height: min(260px, 32vh);
}
</style>
