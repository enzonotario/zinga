import { computed, ref } from 'vue';

const isOpen = ref(false);
const isMinimized = ref(false);
const sessionName = ref<string | null>(null);

export default function useTerminalPanel() {
  const isVisible = computed(() => isOpen.value && !isMinimized.value);
  const hasSession = computed(() => sessionName.value !== null);

  function open(session?: string | null) {
    if (session) {
      sessionName.value = session;
    }
    if (!sessionName.value) return;
    isOpen.value = true;
    isMinimized.value = false;
  }

  function minimize() {
    if (!sessionName.value) return;
    isOpen.value = true;
    isMinimized.value = true;
  }

  function toggle() {
    if (!sessionName.value) return;
    if (!isOpen.value || isMinimized.value) {
      open();
      return;
    }
    minimize();
  }

  function clearSession(session?: string | null) {
    if (session && sessionName.value !== session) return;
    sessionName.value = null;
    isOpen.value = false;
    isMinimized.value = false;
  }

  return {
    isOpen,
    isMinimized,
    isVisible,
    sessionName,
    hasSession,
    open,
    minimize,
    toggle,
    clearSession,
  };
}
