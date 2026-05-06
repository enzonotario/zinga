export const lyricsPanelCardUi = {
  root: 'h-full min-h-0',
  header: 'sticky top-0 z-10 shrink-0 border-b border-(--ui-border)',
  body: 'flex min-h-0 flex-1 flex-col overflow-hidden !p-0',
} as const;

export const lyricsPanelFloatingCardUi = {
  root: 'w-full min-h-0 max-h-[min(80vh,calc(100vh-8rem))] shrink-0',
  header: 'sticky top-0 z-10 shrink-0 border-b border-(--ui-border)',
  body: 'flex min-h-0 flex-col overflow-hidden !p-0',
} as const;
