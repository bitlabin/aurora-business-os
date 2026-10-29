'use client';

import Link from 'next/link';
import { MODULE_META } from '@aurora/types';
import { Badge, Callout, PageHeader, Panel, pickLocalized } from '@aurora/ui';
import { useLocale, useT } from '../../../lib/i18n';
import { useSession } from '../../../lib/session';

/**
 * Home is deliberately honest in Phase 0: it shows what is configured and what the user can
 * do. Revenue/receivable KPIs appear once the ledger exists (Phase 1) — no placeholder numbers.
 */
export default function HomePage() {
  const t = useT();
  const { locale } = useLocale();
  const { session, companyId, capabilities } = useSession();
  const company = session.companies.find((c) => c.id === companyId);

  return (
    <>
      <PageHeader
        title={t('home.title')}
        subtitle={t('home.welcome', { name: session.user.displayName })}
      />
      {!company ? <Callout tone="warning">{t('home.noCompany')}</Callout> : null}
      <div className="au-grid-2">
        <Panel
          title={
            company
              ? t('home.companyContext', { company: company.tradingName ?? company.legalName })
              : t('nav.company')
          }
        >
          {company ? (
            <dl className="au-kv">
              <dt>{t('common.code')}</dt>
              <dd className="mono">{company.code}</dd>
              <dt>{t('admin.baseCurrency')}</dt>
              <dd className="mono">{company.baseCurrency}</dd>
              <dt>{t('common.country')}</dt>
              <dd className="mono">{company.countryCode}</dd>
            </dl>
          ) : null}
        </Panel>
        <Panel title={t('home.modules')}>
          <div className="au-chip-row">
            {(capabilities?.modules ?? []).map((m) => (
              <Badge key={m} tone="success">
                {pickLocalized(MODULE_META[m].label, locale)}
              </Badge>
            ))}
          </div>
        </Panel>
        <Panel title={t('home.quick')}>
          <ul style={{ margin: 0, paddingInlineStart: 18 }}>
            {(capabilities?.quickCreate ?? []).map((q) => (
              <li key={q.key}>
                <Link href={q.href}>{pickLocalized(q.label, locale)}</Link>
              </li>
            ))}
            {(capabilities?.navigation ?? [])
              .filter((n) => n.key !== 'home' && n.parentKey !== null && n.href !== null)
              .map((n) => (
                <li key={n.key}>
                  <Link href={n.href ?? '/home'}>{pickLocalized(n.label, locale)}</Link>
                </li>
              ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
