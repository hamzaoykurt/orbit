import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { headers } from 'next/headers';
import './globals.css';

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
    <html lang="tr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
