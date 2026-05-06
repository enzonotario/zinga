const WIMP_LINK_REGEX = /\[wimpLink\s+(artistId|albumId)="(\d+)"\](.*?)\[\/wimpLink\]/g;
export function stripWimpLinks(text: string | null | undefined): string {
  if (!text) return '';
  return text.replace(WIMP_LINK_REGEX, '$3').replace(/\s+/g, ' ').trim();
}
