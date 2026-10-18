// One rule for links that leave Orbit: only http(s) without credentials, opened outside the app.
export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

// Android hands an intent:// URL to the system, which opens the address in the default browser instead of the
// installed app's in-app (Custom Tab) viewer. The https address stays as the fallback if no handler resolves it.
export function externalIntentUrl(value: string): string | null {
  const safe = safeHttpUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${url.protocol.slice(0, -1)};action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url=${encodeURIComponent(url.href)};end`;
}

export type ExternalClickContext = { href: string | null; pageOrigin: string; android: boolean; standalone: boolean };

/** Returns the intent:// URL to navigate to when a click must be redirected, otherwise null (let the browser follow the link). */
export function intentForExternalClick({ href, pageOrigin, android, standalone }: ExternalClickContext): string | null {
  if (!android || !standalone || !href) return null;
  const safe = safeHttpUrl(href);
  if (!safe || new URL(safe).origin === pageOrigin) return null;
  return externalIntentUrl(safe);
}
