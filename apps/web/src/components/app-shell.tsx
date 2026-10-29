'use client';

import { Suspense, useState, type ReactNode } from 'react';
import { Button, Select, pickLocalized } from '@aurora/ui';
import { useLocale, useT } from '../lib/i18n';
import { useSession } from '../lib/session';
import { SidebarNav } from './sidebar-nav';

/**
 * Original enterprise shell (FDD §2.2, A.1): dark sidebar in the product-wide order the API
 * returns (Home … Settings), top bar with company selector, language switcher and quick-create.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const t = useT();
  const { locale, setLocale } = useLocale();
  const { session, companyId, selectCompany, capabilities, signOut } = useSession();
  const [mobileNav, setMobileNav] = useState(false);

  const nav = capabilities?.navigation ?? [];

  return (
    <div className="au-shell" data-mobile-nav={mobileNav ? 'open' : 'closed'}>
      <aside className="au-sidebar" aria-label={t('nav.menu')}>
        <div className="au-brand">
          <span className="au-brand-mark" />
          <span>{t('app.name')}</span>
        </div>
        <Suspense fallback={null}>
          <SidebarNav
            items={nav}
            onNavigate={() => {
              setMobileNav(false);
            }}
          />
        </Suspense>
        <div className="au-sidebar-footer">
          <span className="au-sidebar-user">{session.user.displayName}</span>
          <span className="au-sidebar-tenant">{session.tenant.name}</span>
        </div>
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
        <Button size="sm" onClick={() => void signOut()}>
          {t('nav.signout')}
        </Button>
      </header>

      <main className="au-main">{children}</main>
    </div>
  );
}
