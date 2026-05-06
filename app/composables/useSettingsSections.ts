export interface SettingsSection {
  id: string
  labelKey: string
  icon: string
}
const ALL_SECTIONS: SettingsSection[] = [
  { id: 'general', labelKey: 'pages.settings.general', icon: 'i-heroicons-cog-6-tooth' },
  { id: 'system', labelKey: 'pages.settings.system', icon: 'i-heroicons-server-stack' },
  { id: 'remote', labelKey: 'pages.settings.remoteServer', icon: 'i-heroicons-device-phone-mobile' },
  { id: 'library', labelKey: 'pages.settings.library', icon: 'i-heroicons-musical-note' },
  { id: 'client', labelKey: 'pages.settings.remoteClient', icon: 'i-heroicons-signal' },
  { id: 'about', labelKey: 'pages.settings.about', icon: 'i-heroicons-information-circle' },
];
export function useSettingsSections() {
  const { isRemoteMode } = useRemoteClient();
  const sections = computed(() =>
    ALL_SECTIONS.filter((s) => {
      if (s.id === 'system' && isRemoteMode.value) return false;
      if (s.id === 'remote' && isRemoteMode.value) return false;
      return true;
    }),
  );
  const activeSection = ref(sections.value[0]?.id ?? 'general');
  watch(
    sections,
    (newSections) => {
      const ids = newSections.map((s) => s.id);
      if (ids.length && !ids.includes(activeSection.value)) {
        activeSection.value = newSections[0]!.id;
      }
    },
    { immediate: false },
  );
  return {
    sections,
    activeSection,
  };
}
