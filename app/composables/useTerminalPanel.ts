import { computed, ref } from 'vue';

export type TerminalCommand = 'InstallDependencies';

export interface TerminalOutputEvent {
  id: string
  data: string
}
export interface TerminalExitEvent {
  id: string
  code: number | null
}

const sessionId = ref<string | null>(null);
const starting = ref(false);
const running = ref(false);
const exitCode = ref<number | null>(null);
const error = ref('');

const pendingOutput = new Map<string, string>();
const pendingExit = new Map<string, number | null>();
let outputSink: ((data: string) => void) | null = null;

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

function finish(code: number | null) {
  running.value = false;
  exitCode.value = code;
}

function flushPendingOutput() {
  const id = sessionId.value;
  if (!id || !outputSink) return;
  const data = pendingOutput.get(id);
  pendingOutput.delete(id);
  if (data) outputSink(data);
}

async function invokeTerminal<T>(command: string, args: Record<string, unknown>) {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

export default function useTerminalPanel() {
  const isOpen = computed(() => sessionId.value !== null);

  function handleOutput({ id, data }: TerminalOutputEvent) {
    if (id === sessionId.value && outputSink) {
      outputSink(data);
      return;
    }
    if (id !== sessionId.value && !starting.value) return;
    pendingOutput.set(id, (pendingOutput.get(id) ?? '') + data);
  }

  function handleExit({ id, code }: TerminalExitEvent) {
    if (id === sessionId.value) {
      finish(code);
      return;
    }
    if (starting.value) pendingExit.set(id, code);
  }

  function attach(sink: (data: string) => void) {
    outputSink = sink;
    flushPendingOutput();
  }

  function detach() {
    outputSink = null;
  }

  function reset() {
    outputSink = null;
    sessionId.value = null;
    running.value = false;
    exitCode.value = null;
    error.value = '';
    pendingOutput.clear();
    pendingExit.clear();
  }

  async function start(command: TerminalCommand) {
    if (starting.value || running.value) return;
    reset();
    starting.value = true;
    try {
      const id = await invokeTerminal<string>('terminal_start', { command });
      sessionId.value = id;
      running.value = true;
      for (const key of pendingOutput.keys()) {
        if (key !== id) pendingOutput.delete(key);
      }
      if (pendingExit.has(id)) finish(pendingExit.get(id) ?? null);
      pendingExit.clear();
    } catch (err) {
      error.value = errorMessage(err);
      console.error('Terminal start error:', err);
    } finally {
      starting.value = false;
    }
  }

  async function write(data: string) {
    const id = sessionId.value;
    if (!id || !running.value) return;
    try {
      await invokeTerminal('terminal_write', { id, data });
    } catch (err) {
      if (running.value) error.value = errorMessage(err);
    }
  }

  async function resize(cols: number, rows: number) {
    const id = sessionId.value;
    if (!id || !running.value) return;
    try {
      await invokeTerminal('terminal_resize', { id, cols, rows });
    } catch (err) {
      console.error('Terminal resize error:', err);
    }
  }

  async function kill() {
    const id = sessionId.value;
    if (!id || !running.value) return;
    try {
      await invokeTerminal('terminal_kill', { id });
    } catch (err) {
      error.value = errorMessage(err);
    }
  }

  async function close() {
    await kill();
    reset();
  }

  return {
    sessionId,
    starting,
    running,
    exitCode,
    error,
    isOpen,
    handleOutput,
    handleExit,
    attach,
    detach,
    start,
    write,
    resize,
    kill,
    close,
  };
}
