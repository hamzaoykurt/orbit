'use client';

import { useEffect } from 'react';
import { intentForExternalClick } from './external-link';

// Installed Android app: a link to another site would open inside the app's own viewer. Send it to the default browser.
// Everywhere else (desktop, mobile browser tab, iOS) the links already carry target="_blank" and open in a new tab.
export function ExternalLinks() {
  useEffect(() => {
    const android = /Android/i.test(navigator.userAgent);
    if (!android) return;
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: minimal-ui)').matches;
    if (!standalone) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute('download')) return;
      const intent = intentForExternalClick({ href: anchor.href, pageOrigin: window.location.origin, android, standalone });
      if (!intent) return;
      event.preventDefault();
      window.location.href = intent;
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
  return null;
}
