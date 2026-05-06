export type PlayerDisplayMode = 'vinyl' | 'cover';
export const useSettings = () => {
  const playerDisplayMode = useState<PlayerDisplayMode>('settings:playerDisplayMode', () => {
    if (import.meta.client) {
      const stored = localStorage.getItem('settings:playerDisplayMode');
      if (stored === 'vinyl' || stored === 'cover') {
        return stored;
      }
    }
    return 'vinyl';
  });
  const debugMode = useState<boolean>('settings:debugMode', () => {
    if (import.meta.client) {
      return localStorage.getItem('settings:debugMode') === 'true';
    }
    return false;
  });
  const showExplicitIndicator = useState<boolean>('settings:showExplicitIndicator', () => {
    if (import.meta.client) {
      return localStorage.getItem('settings:showExplicitIndicator') === 'true';
    }
    return false;
  });
  const setPlayerDisplayMode = (mode: PlayerDisplayMode) => {
    playerDisplayMode.value = mode;
    if (import.meta.client) {
      localStorage.setItem('settings:playerDisplayMode', mode);
    }
  };
  const setDebugMode = (enabled: boolean) => {
    debugMode.value = enabled;
    if (import.meta.client) {
      localStorage.setItem('settings:debugMode', String(enabled));
    }
  };
  const setShowExplicitIndicator = (enabled: boolean) => {
    showExplicitIndicator.value = enabled;
    if (import.meta.client) {
      localStorage.setItem('settings:showExplicitIndicator', String(enabled));
    }
  };

  return {
    playerDisplayMode,
    setPlayerDisplayMode,
    debugMode,
    setDebugMode,
    showExplicitIndicator,
    setShowExplicitIndicator,
  };
};
