import type { Metadata, Viewport } from 'next';
import { Geist, Bricolage_Grotesque } from 'next/font/google';
import { headers } from 'next/headers';
import './globals.css';
import './workspace-scale.css';
import './brand-logo.css';
import './theme-accent.css';
import './workspace-refresh.css';
import './energy.css';
import './ui/feel.css';
import './daylight.css';
import { PwaRegister } from './pwa-register';
import { startupScript } from './startup';
import { authClientScript } from './auth-client';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

// Headings and numbers only (h1/h2, XP, streak, level, clock). Latin-ext carries the Turkish glyphs.
const displayFont = Bricolage_Grotesque({
  variable: '--font-display',
  subsets: ['latin', 'latin-ext'],
  weight: ['700', '800'],
  display: 'swap',
});

const title = 'Orbit — Personal OS';
const description = 'Hayatın, projelerin, programların ve hedeflerin için sakin bir çalışma alanı.';
// One theme only (Gun Isigi). Stored preference is left untouched but no longer read.
const themeBootScript = `(function(){var d=document.documentElement;d.dataset.theme='light';d.style.colorScheme='light';var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content','#F5EADA')})();`;

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  colorScheme: 'light',
};

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const rawHost = (requestHeaders.get('host') || 'localhost:3000').toLowerCase();
  const safeHost = rawHost === 'localhost' || rawHost.startsWith('localhost:') ||
    ['openai.com', 'chatgpt.com', 'openai.site'].some((domain) => rawHost === domain || rawHost.endsWith(`.${domain}`));
  const origin = safeHost
    ? `${rawHost.startsWith('localhost') ? 'http' : 'https'}://${rawHost}`
    : 'http://localhost:3000';
  const image = new URL('/og.png', origin).toString();

  return {
    metadataBase: new URL(origin),
    title,
    description,
    manifest: '/manifest.webmanifest?v=12',
    icons: {
      icon: [{ url: '/orbit-favicon-v8.png', sizes: '64x64', type: 'image/png' }, { url: '/orbit-icon-v8-192.png', sizes: '192x192', type: 'image/png' }],
      shortcut: '/orbit-favicon-v8.png',
      apple: [{ url: '/orbit-apple-touch-v8.png', sizes: '180x180', type: 'image/png' }],
    },
    appleWebApp: { capable: true, title: 'Orbit', statusBarStyle: 'black-translucent' },
    openGraph: { title, description, type: 'website', locale: 'tr_TR', images: [{ url: image, width: 1672, height: 941, alt: 'Orbit Personal OS' }] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" data-theme="light" suppressHydrationWarning>
      <head><style dangerouslySetInnerHTML={{ __html: "html,body{background:#F5EADA;color:#1B1035}" }}/><link rel="manifest" href="/manifest.webmanifest?v=12"/><link rel="icon" href="/orbit-favicon-dark-v8.png" type="image/png" sizes="64x64" media="(prefers-color-scheme: dark)"/><meta name="theme-color" content="#F5EADA"/><link rel="apple-touch-startup-image" href="/splash/apple-splash-1170x2532.png" media="(device-width:390px) and (device-height:844px) and (-webkit-device-pixel-ratio:3) and (orientation:portrait)"/><link rel="apple-touch-startup-image" href="/splash/apple-splash-1290x2796.png" media="(device-width:430px) and (device-height:932px) and (-webkit-device-pixel-ratio:3) and (orientation:portrait)"/><script dangerouslySetInnerHTML={{ __html: authClientScript }}/><script dangerouslySetInnerHTML={{ __html: themeBootScript }}/><script dangerouslySetInnerHTML={{ __html: startupScript }}/></head>
      <body
        className={`${geistSans.variable} ${displayFont.variable} antialiased`}
      >
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
