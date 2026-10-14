// Light or dark app icon: picked from ?icon= (the page links the right URL) or the orbit_icon cookie.
// Light is the default. Only icons and splash/theme colours change; id, start_url and scope stay fixed.
export type IconChoice = 'light' | 'dark';
export const DARK_COLOR = '#0B0A0F';
const LIGHT_COLOR = '#F5EADA';

export function iconChoice(url: URL, cookieHeader: string | null): IconChoice {
  const param = url.searchParams.get('icon');
  if (param === 'dark' || param === 'light') return param;
  return /(?:^|;\s*)orbit_icon=dark(?:;|$)/.test(cookieHeader ?? '') ? 'dark' : 'light';
}

export function manifestForIcon(source: string, choice: IconChoice): string {
  if (choice === 'light') return source;
  return source
    .replaceAll('/orbit-icon-v8-', '/orbit-icon-dark-v8-')
    .replaceAll('/orbit-favicon-v8.png', '/orbit-favicon-dark-v8.png')
    .replaceAll('/icon-maskable-192.png', '/icon-maskable-dark-v8-192.png')
    .replaceAll('/icon-maskable-512.png', '/icon-maskable-dark-v8-512.png')
    .replaceAll(`"${LIGHT_COLOR}"`, `"${DARK_COLOR}"`);
}
