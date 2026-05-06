import { open } from '@tauri-apps/plugin-shell';

export default function useOpenExternalLink() {
  async function openExternalLink(url: string) {
    try {
      await open(url);
    } catch {
      window.open(url, '_blank');
    }
  }
  return { openExternalLink };
}
