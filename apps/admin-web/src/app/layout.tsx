import { LOCALE_COOKIE, isLocale } from '@onepay/web-core/locale';
import type { Metadata, Viewport } from 'next';
import { Inter, Noto_Sans_Khmer } from 'next/font/google';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const khmer = Noto_Sans_Khmer({ subsets: ['khmer'], variable: '--font-khmer', display: 'swap', weight: ['400', '500', '600', '700'] });

export const metadata: Metadata = {
  title: { default: 'One PayAlert · CAM Admin', template: '%s · CAM Admin' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#0F1B2D', width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  // CAM staff default to English; they can switch to Khmer or Chinese.
  const locale = isLocale(saved) ? saved : 'en';
  return (
    <html lang={locale} className={`${inter.variable} ${khmer.variable}`}>
      <body className="min-h-dvh antialiased">
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
