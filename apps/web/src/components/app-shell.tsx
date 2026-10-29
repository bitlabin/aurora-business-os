'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Button, Select, pickLocalized } from '@aurora/ui';
import { useLocale, useT } from '../lib/i18n';
import { useSession } from '../lib/session';

/**
 * Original enterprise shell (FDD §2.2, A.1): dark sidebar generated from the capabilities
 * response, top bar with company selector, language switcher and quick-create.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const t = useT();
  const { locale, setLocale } = useLocale();
  const { session, companyId, selectCompany, capabilities, signOut } = useSession();
  const pathname = usePathname();
  const [mobileNav, setMobileNav] = useState(false);

  const nav = capabilities?.navigation ?? [];
  const main = nav.filter((n) => !n.key.startsWith('admin.'));
  const admin = nav.filter((n) => n.key.startsWith('admin.'));

  return (
    <div className="au-shell" data-mobile-nav={mobileNav ? 'open' : 'closed'}>
      <aside className="au-sidebar" aria-label={t('nav.menu')}>
        <div className="au-brand">
          <span className="au-brand-mark" />
          <span>{t('app.name')}</span>
        </div>
        <nav>
          <ul className="au-nav">
            {main.map((n) => (
              <li key={n.key} className="au-nav-item">
                <Link
                  href={n.href}
                  aria-current={pathname.startsWith(n.href) ? 'page' : undefined}
                  onClick={() => {
                    setMobileNav(false);
                  }}
                >
                  {pickLocalized(n.label, locale)}
                </Link>
              </li>
            ))}
            {admin.length > 0 ? (
              <li className="au-nav-section">{locale === 'ar' ? 'الإدارة' : 'Administration'}</li>
            ) : null}
            {admin.map((n) => (
              <li key={n.key} className="au-nav-item">
                <Link
                  href={n.href}
                  aria-current={pathname.startsWith(n.href) ? 'page' : undefined}
                  onClick={() => {
                    setMobileNav(false);
                  }}
                >
                  {pickLocalized(n.label, locale)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <header className="au-topbar">
        <Button
          variant="ghost"
          size="sm"
          className="au-mobile-only"
          aria-label={t('nav.menu')}
          onClick={() => {
            setMobileNav((v) => !v);
          }}
        >
          ☰
        </Button>
        <label className="au-visually-hidden" htmlFor="company-select">
          {t('nav.company')}
        </label>
        <Select
          id="company-select"
          value={companyId ?? ''}
          onChange={(e) => {
            selectCompany(e.target.value);
          }}
          disabled={session.companies.length === 0}
          style={{ minWidth: 220 }}
        >
          {session.companies.length === 0 ? <option value="">—</option> : null}
          {session.companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} · {c.tradingName ?? c.legalName} ({c.baseCurrency})
            </option>
          ))}
        </Select>
        {capabilities && capabilities.quickCreate.length > 0 ? (
          <Select
            aria-label={t('nav.quickCreate')}
            value=""
            onChange={(e) => e.target.value && (window.location.href = e.target.value)}
            style={{ minWidth: 140 }}
          >
            <option value="">+ {t('nav.quickCreate')}</option>
            {capabilities.quickCreate.map((q) => (
              <option key={q.key} value={q.href}>
                {pickLocalized(q.label, locale)}
              </option>
            ))}
          </Select>
        ) : null}
        <span className="au-topbar-spacer" />
        <Select
          aria-label={t('nav.language')}
          value={locale}
          onChange={(e) => {
            setLocale(e.target.value as 'en' | 'ar');
          }}
          style={{ width: 110 }}
        >
          <option value="en">English</option>
          <option value="ar">العربية</option>
        </Select>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
          {session.user.displayName} · {session.tenant.name}
        </span>
        <Button size="sm" onClick={() => void signOut()}>
          {t('nav.signout')}
        </Button>
      </header>

      <main className="au-main">{children}</main>
    </div>
  );
}
