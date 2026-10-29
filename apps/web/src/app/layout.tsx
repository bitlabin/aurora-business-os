import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { LocaleProvider } from '../lib/i18n';
import { directionOf } from '../lib/i18n-core';
import { QueryProvider } from '../lib/session';
import './globals.css';

export const metadata: Metadata = {
  title: 'Aurora Business OS',
  description: 'Multi-industry CRM + ERP + accounting platform',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const store = await cookies();
  const locale = store.get('aurora_locale')?.value === 'ar' ? 'ar' : 'en';
  return (
    <html lang={locale} dir={directionOf(locale)}>
      <body>
        <LocaleProvider initial={locale}>
          <QueryProvider>{children}</QueryProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
