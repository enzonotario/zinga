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
}
interface ScriptSession {
  sessionName: string | null
  hasTmux: boolean
}
const status = ref<SystemStatus | null>(null);
const loading = ref(false);
const scriptRunning = ref(false);
const scriptOutput = ref('');
const error = ref('');
const activeSession = ref<string | null>(null);
let pollInterval: ReturnType<typeof setInterval> | null = null;
function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}
async function finishScript(onDone?: () => Promise<void>, sessionName = activeSession.value) {
  stopPolling();
  scriptRunning.value = false;
  activeSession.value = null;
  useTerminalPanel().clearSession(sessionName);
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
    return status.value.mopidy.running && status.value.icecast.running && status.value.ffmpeg.running;
  });
  async function checkSystem() {
    loading.value = true;
    error.value = '';
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      status.value = await invoke<SystemStatus>('system_check');
    } catch (e: any) {
      error.value = e?.toString() ?? t('setup.unknownError');
    } finally {
      loading.value = false;
    }
  }
  async function runScript(command: string) {
    scriptRunning.value = true;
    scriptOutput.value = '';
    error.value = '';
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const session = await invoke<ScriptSession>(command);
      if (session.hasTmux && session.sessionName) {
        activeSession.value = session.sessionName;
        terminalPanel.open(session.sessionName);
        await pollTmuxSession(session.sessionName, checkSystem);
      } else {
        scriptRunning.value = false;
        setTimeout(checkSystem, 5000);
      }
    } catch (e: any) {
      error.value = e?.toString() ?? t('setup.unknownError');
      scriptRunning.value = false;
    }
  }
  async function runSetup() {
    await runScript('run_setup_script');
  }
  async function startServices() {
    await runScript('run_start_services');
  }
  async function stopServices() {
    await runScript('run_stop_services');
  }
  async function restartServices() {
    await runScript('run_restart_services');
  }
  async function verify() {
    await runScript('run_verify');
  }
  async function runUninstall() {
    await runScript('run_uninstall');
  }
  async function openTerminal() {
    if (!activeSession.value) return;
    terminalPanel.open(activeSession.value);
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
    scriptRunning,
    scriptOutput,
    error,
    activeSession,
    allInstalled,
    allRunning,
    checkSystem,
    runSetup,
    startServices,
    stopServices,
    restartServices,
    verify,
    runUninstall,
    openTerminal,
    clearScriptState,
  };
}
