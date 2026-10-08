import { ref } from 'vue';

export interface PluginStatus {
  name: string
  available: boolean
}
export interface SystemCheck {
  ffmpeg: boolean
  gstreamerPlugins: PluginStatus[]
  ready: boolean
}

export const INSTALL_HINT = 'sudo apt install ffmpeg gstreamer1.0-plugins-good gstreamer1.0-plugins-base';

const status = ref<SystemCheck | null>(null);
const loading = ref(false);
const error = ref('');

export default function useSystemSetup() {
  const { t } = useI18n();

  async function checkSystem() {
    loading.value = true;
    error.value = '';
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      status.value = await invoke<SystemCheck>('system_check');
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err ?? t('setup.unknownError'));
      console.error('System check error:', err);
    } finally {
      loading.value = false;
    }
  }

  return {
    status,
    loading,
    error,
    checkSystem,
  };
}
