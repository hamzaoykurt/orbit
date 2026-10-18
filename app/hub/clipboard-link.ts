// Detects a single web address in clipboard text. Pure, so it can be tested; the clipboard text never leaves the browser.
export function extractClipboardUrl(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const value = text.trim().replace(/^<(.+)>$/, '$1').replace(/^["'“‘](.+)["'”’]$/, '$1');
  if (!value || value.length > 2048 || /\s/.test(value)) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    if (!url.hostname.includes('.')) return null;
    return url.toString();
  } catch { return null; }
}

// Call directly from a click handler (user gesture). Any failure (no API, permission denied, empty) is silent.
export async function readClipboardUrl(clipboard: Pick<Clipboard, 'readText'> | undefined = typeof navigator === 'undefined' ? undefined : navigator.clipboard): Promise<string | null> {
  try {
    if (!clipboard || typeof clipboard.readText !== 'function') return null;
    return extractClipboardUrl(await clipboard.readText());
  } catch { return null; }
}
