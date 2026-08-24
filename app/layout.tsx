import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { headers } from 'next/headers';
import './globals.css';
import { PwaRegister } from './pwa-register';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const title = 'Orbit — Personal OS';
const description = 'Hayatın, projelerin, programların ve hedeflerin için sakin bir çalışma alanı.';
const themeBootScript = `(function(){try{var raw=localStorage.getItem('orbit-personal-os');var saved=raw?JSON.parse(raw):null;var preference=saved&&saved.settings&&saved.settings.theme?saved.settings.theme:'system';var dark=preference==='dark'||(preference==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=dark?'dark':'light';document.documentElement.style.colorScheme=dark?'dark':'light'}catch(e){var dark=window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.dataset.theme=dark?'dark':'light';document.documentElement.style.colorScheme=dark?'dark':'light'}})();`;

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
    manifest: '/manifest.webmanifest',
    icons: {
      icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }, { url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
      shortcut: '/favicon.svg',
      apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
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
    <html lang="tr" suppressHydrationWarning>
      <head><link rel="manifest" href="/manifest.webmanifest"/><meta name="theme-color" content="#7564dc"/><script dangerouslySetInnerHTML={{ __html: themeBootScript }}/></head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
