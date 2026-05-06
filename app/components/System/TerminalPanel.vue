<script setup lang="ts">
import type { WTerm } from '@wterm/vue';
import { Terminal } from '@wterm/vue';
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import useSystemSetup from '~/composables/useSystemSetup';
import useTerminalPanel from '~/composables/useTerminalPanel';
import '@wterm/vue/css';

const { t } = useI18n();
const terminalPanel = useTerminalPanel();
const { scriptOutput, clearScriptState } = useSystemSetup();
const outputElement = ref<HTMLElement | null>(null);
const error = ref('');
const outputText = ref('');
const shouldFollowOutput = ref(true);
let terminal: WTerm | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;

const title = computed(() => terminalPanel.sessionName.value || t('terminal.title'));
const headerTitle = computed(() => title.value.replace(/^zinga-/, ''));

function stopPolling() {
  if (!pollInterval) return;
  clearInterval(pollInterval);
  pollInterval = null;
}

function resetTerminal() {
  outputText.value = '';
}

function normalizeOutput(output: string) {
  return output
    .replace(/\r\n/g, '\n')
    .replace(/\s+$/g, '');
}

function setOutput(output: string) {
  const normalizedOutput = normalizeOutput(output);
  if (!normalizedOutput) return;
  const shouldScroll = shouldFollowOutput.value;
  outputText.value = normalizedOutput;
  if (shouldScroll) {
    nextTick(() => scrollOutputToBottom());
  }
}

async function handleTerminalData(data: string) {
  if (!data) return;
  await writeInput(data);
  await refreshOutput();
}

async function writeInput(data: string) {
  const sessionName = terminalPanel.sessionName.value;
  if (!sessionName) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('send_tmux_input', {
      sessionName,
      data,
    });
  } catch (err) {
    if (isClosedSessionError(err)) {
      error.value = '';
      await clearScriptState(sessionName);
      return;
    }

    error.value = err instanceof Error ? err.message : String(err);
    await clearScriptState(sessionName);
  }
}

async function refreshOutput() {
  const sessionName = terminalPanel.sessionName.value;
  if (!sessionName) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const alive = await invoke<boolean>('is_tmux_session_alive', {
      sessionName,
    });

    if (alive) {
      const output = await invoke<string>('get_tmux_output', {
        sessionName,
      });
      setOutput(output || scriptOutput.value);
    } else {
      setOutput(scriptOutput.value);
    }

    if (!alive) {
      stopPolling();
      error.value = '';
      await clearScriptState(sessionName);
    }
  } catch (err) {
    if (isClosedSessionError(err)) {
      error.value = '';
      stopPolling();
      await clearScriptState(sessionName);
      return;
    }

    error.value = err instanceof Error ? err.message : String(err);
    stopPolling();
    await clearScriptState(sessionName);
  }
}

function startPolling() {
  stopPolling();
  refreshOutput();
  pollInterval = setInterval(refreshOutput, 500);
}

async function initTerminal() {
  await nextTick();
}

function isClosedSessionError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes('no server running') || message.includes('can\'t find session');
}

function isScrolledToBottom(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight < 8;
}

function scrollOutputToBottom() {
  if (!outputElement.value) return;
  outputElement.value.scrollTop = outputElement.value.scrollHeight;
}

function handleOutputScroll() {
  if (!outputElement.value) return;
  shouldFollowOutput.value = isScrolledToBottom(outputElement.value);
}

function onTerminalReady(instance: WTerm) {
  terminal = instance;
}

async function openTerminal() {
  await nextTick();
  await initTerminal();
  terminal?.focus();
  startPolling();
}

watch(
  () => terminalPanel.sessionName.value,
  async (session, previousSession) => {
    if (!session) {
      stopPolling();
      return;
    }
    if (session !== previousSession) {
      resetTerminal();
      error.value = '';
      shouldFollowOutput.value = true;
    }
    await openTerminal();
  },
);

watch(
  () => terminalPanel.isVisible.value,
  async (visible) => {
    if (!visible || !terminalPanel.sessionName.value) return;
    await openTerminal();
  },
);

watch(
  () => scriptOutput.value,
  (output) => {
    setOutput(output);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  stopPolling();
  terminal = null;
});
</script>

<template>
  <div v-show="terminalPanel.isVisible.value" class="terminal-dock border-t border-neutral-200 dark:border-neutral-800 bg-(--ui-bg)/92">
    <div class="flex items-center justify-between gap-3 px-4 py-1.5 border-b border-neutral-200 dark:border-neutral-800">
      <div class="flex items-center gap-2 min-w-0">
        <UIcon name="i-heroicons-command-line" class="w-4 h-4 text-primary shrink-0" />
        <span class="text-xs font-medium truncate">{{ headerTitle }}</span>
      </div>
      <UButton
        icon="i-heroicons-chevron-down"
        variant="ghost"
        size="xs"
        :aria-label="t('terminal.minimize')"
        @click="terminalPanel.minimize()"
      />
    </div>
    <div class="terminal-shell min-h-0 px-2 pb-2 pt-1">
      <Terminal
        class="terminal-input"
        :auto-resize="false"
        :cursor-blink="true"
        @data="handleTerminalData"
        @ready="onTerminalReady"
      />
      <pre
        ref="outputElement"
        class="terminal-output h-full w-full"
        tabindex="0"
        @click="terminal?.focus()"
        @scroll="handleOutputScroll"
      >{{ outputText }}</pre>
    </div>
    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      :title="error"
      class="mx-4 mb-3"
    />
  </div>
</template>

<style scoped>
.terminal-dock {
  backdrop-filter: blur(16px);
}

.terminal-shell {
  position: relative;
  height: min(220px, 28vh);
}

:deep(.terminal-input.wterm) {
  position: absolute;
  inset: 0;
  height: 1px;
  width: 1px;
  opacity: 0;
  pointer-events: none;
}

:deep(.terminal-input.wterm .term-grid) {
  display: none;
}

:deep(.terminal-input.wterm .term-cursor) {
  display: none;
}

:deep(.terminal-input.wterm) {
  --term-bg: transparent;
  --term-fg: transparent;
}

:deep(.terminal-output) {
  margin: 0;
  overflow: auto;
  border-radius: 8px;
  background: #111111;
  color: #e5e7eb;
  padding: 12px;
  font-family: Menlo, Consolas, "DejaVu Sans Mono", "Courier New", monospace;
  font-size: 13px;
  line-height: 16px;
  white-space: pre-wrap;
  user-select: text;
}
</style>
