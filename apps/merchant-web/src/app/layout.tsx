import type { Metadata, Viewport } from 'next';
import { Inter, Noto_Sans_Khmer } from 'next/font/google';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { LOCALE_COOKIE, isLocale } from '@/lib/i18n/config';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const khmer = Noto_Sans_Khmer({ subsets: ['khmer'], variable: '--font-khmer', display: 'swap', weight: ['400', '500', '600', '700'] });

export const metadata: Metadata = {
  title: { default: 'One PayAlert', template: '%s · One PayAlert' },
  description: 'One Platform. Multiple Banks. Instant Payment Alerts.',
  applicationName: 'One PayAlert',
};

export const viewport: Viewport = { themeColor: '#0759B8', width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const jar = await cookies();
  const saved = jar.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(saved) ? saved : 'km';
  return (
    <html lang={locale} className={`${inter.variable} ${khmer.variable}`}>
      <body className="min-h-dvh antialiased">
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
