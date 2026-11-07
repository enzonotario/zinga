import { invoke, isTauri } from '@tauri-apps/api/core';
import useRemoteClient from '~/composables/useRemoteClient';

const HEARTBEAT_INTERVAL_MS = 15000;

export default defineNuxtPlugin(() => {
  if (!isTauri()) return;
  const remote = useRemoteClient();

  function beat() {
    if (remote.isRemoteMode.value) return;
    invoke('frontend_heartbeat').catch((err) => console.error('Frontend heartbeat error:', err));
  }

  beat();
  setInterval(beat, HEARTBEAT_INTERVAL_MS);
});
