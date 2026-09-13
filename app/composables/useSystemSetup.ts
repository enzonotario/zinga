import { computed, onScopeDispose, ref } from 'vue';
import useTerminalPanel from './useTerminalPanel';

interface ServiceStatus {
  installed: boolean
  running: boolean
  version: string | null
}
interface SystemStatus {
  mopidy: ServiceStatus
  icecast: ServiceStatus
  ffmpeg: ServiceStatus
  mopidyConfigExists: boolean
  icecastConfigExists: boolean
  pipelineReady: boolean
  pulseSinkReady: boolean
  lastLogPath: string | null
}
interface ScriptSession {
  sessionName: string | null
  hasTmux: boolean
  logPath: string | null
}
interface EnsureResult {
  ready: boolean
  started: boolean
  logPath: string | null
  message: string
}

const status = ref<SystemStatus | null>(null);
const loading = ref(false);
const ensuring = ref(false);
const scriptRunning = ref(false);
const scriptOutput = ref('');
const lastLogPath = ref<string | null>(null);
const lastExitCode = ref<number | null>(null);
const error = ref('');
const activeSession = ref<string | null>(null);
const activeScriptName = ref<string | null>(null);
let pollInterval: ReturnType<typeof setInterval> | null = null;

function scriptNameFromSession(sessionName: string | null) {
  if (!sessionName?.startsWith('zinga-')) return null;
  return sessionName.slice('zinga-'.length);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

async function finishScript(onDone?: () => Promise<void>, sessionName = activeSession.value) {
  stopPolling();
  const scriptName = activeScriptName.value || scriptNameFromSession(sessionName);
  scriptRunning.value = false;
  activeSession.value = null;
  useTerminalPanel().clearSession(sessionName);

  if (scriptName) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const code = await invoke<number | null>('get_script_exit_code', { scriptName });
      lastExitCode.value = code;
      if (code != null && code !== 0) {
        const log = await invoke<string>('get_script_log', { scriptName }).catch(() => scriptOutput.value);
        if (log) scriptOutput.value = log;
        error.value = `El script falló (código ${code}). Revisá la salida o el log.`;
      }
      const logPath = lastLogPath.value;
      if (!logPath) {
        lastLogPath.value = status.value?.lastLogPath ?? null;
      }
    } catch {
      // ignore — checkSystem still runs
    }
  }

  activeScriptName.value = null;
  if (onDone) {
    await onDone();
  }
}

async function pollTmuxSession(sessionName: string, onDone: () => Promise<void>) {
  const { invoke } = await import('@tauri-apps/api/core');
  stopPolling();
  pollInterval = setInterval(async () => {
    try {
      const alive = await invoke<boolean>('is_tmux_session_alive', { sessionName });
      if (!alive) {
        await finishScript(onDone);
        return;
      }

      const output = await invoke<string>('get_tmux_output', { sessionName });
      if (output) {
        scriptOutput.value = output;
      }
    } catch {
      await finishScript(onDone);
    }
  }, 1000);
}

export default function useSystemSetup() {
  const { t } = useI18n();
  const terminalPanel = useTerminalPanel();
  const allInstalled = computed(() => {
    if (!status.value) return false;
    return status.value.mopidy.installed && status.value.icecast.installed && status.value.ffmpeg.installed;
  });
  const allRunning = computed(() => {
    if (!status.value) return false;
    return status.value.pipelineReady
      || (status.value.mopidy.running && status.value.icecast.running && status.value.ffmpeg.running);
  });
  const pipelineReady = computed(() => status.value?.pipelineReady ?? false);

  async function checkSystem() {
    loading.value = true;
    error.value = '';
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      status.value = await invoke<SystemStatus>('system_check');
      if (status.value.lastLogPath) {
        lastLogPath.value = status.value.lastLogPath;
      }
    } catch (e: any) {
      error.value = e?.toString() ?? t('setup.unknownError');
    } finally {
      loading.value = false;
    }
  }

  async function ensurePipeline(force = false): Promise<EnsureResult> {
    ensuring.value = true;
    error.value = '';
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<EnsureResult>('ensure_services', { force });
      if (result.logPath) {
        lastLogPath.value = result.logPath;
      }
      await checkSystem();
      if (!result.ready) {
        error.value = result.message;
        if (result.logPath) {
          const log = await invoke<string>('get_script_log', { scriptName: 'ensure' }).catch(() => '');
          if (log) scriptOutput.value = log;
        }
      }
      return result;
    } catch (e: any) {
      const message = e?.toString() ?? t('setup.unknownError');
      error.value = message;
      return {
        ready: false,
        started: false,
        logPath: lastLogPath.value,
        message,
      };
    } finally {
      ensuring.value = false;
    }
  }

  async function runScript(command: string, scriptNameHint?: string) {
    scriptRunning.value = true;
    scriptOutput.value = '';
    error.value = '';
    lastExitCode.value = null;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const session = await invoke<ScriptSession>(command);
      if (session.logPath) {
        lastLogPath.value = session.logPath;
      }
      activeScriptName.value = scriptNameHint || scriptNameFromSession(session.sessionName);
      if (session.hasTmux && session.sessionName) {
        activeSession.value = session.sessionName;
        terminalPanel.open(session.sessionName);
        await pollTmuxSession(session.sessionName, checkSystem);
      } else {
        scriptRunning.value = false;
        setTimeout(async () => {
          if (activeScriptName.value) {
            const code = await invoke<number | null>('get_script_exit_code', {
              scriptName: activeScriptName.value,
            }).catch(() => null);
            lastExitCode.value = code;
            if (code != null && code !== 0) {
              error.value = `El script falló (código ${code}). Revisá el log.`;
            }
          }
          await checkSystem();
          activeScriptName.value = null;
        }, 5000);
      }
    } catch (e: any) {
      error.value = e?.toString() ?? t('setup.unknownError');
      scriptRunning.value = false;
      activeScriptName.value = null;
    }
  }

  async function runSetup() {
    await runScript('run_setup_script', 'setup');
  }
  async function startServices() {
    await runScript('run_start_services', 'start');
  }
  async function stopServices() {
    await runScript('run_stop_services', 'stop');
  }
  async function restartServices() {
    await runScript('run_restart_services', 'restart');
  }
  async function verify() {
    await runScript('run_verify', 'verify');
  }
  async function runUninstall() {
    await runScript('run_uninstall', 'uninstall');
  }
  async function openTerminal() {
    if (!activeSession.value) return;
    terminalPanel.open(activeSession.value);
  }
  async function openLastLog() {
    if (!lastLogPath.value) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('shell_open', { path: lastLogPath.value });
    } catch {
      // ignore
    }
  }
  async function clearScriptState(sessionName?: string | null) {
    await finishScript(undefined, sessionName);
  }
  onScopeDispose(() => {
    stopPolling();
  });
  return {
    status,
    loading,
    ensuring,
    scriptRunning,
    scriptOutput,
    lastLogPath,
    lastExitCode,
    error,
    activeSession,
    allInstalled,
    allRunning,
    pipelineReady,
    checkSystem,
    ensurePipeline,
    runSetup,
    startServices,
    stopServices,
    restartServices,
    verify,
    runUninstall,
    openTerminal,
    openLastLog,
    clearScriptState,
  };
}
