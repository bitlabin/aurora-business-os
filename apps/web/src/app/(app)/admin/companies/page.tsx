'use client';

import { useQuery } from '@tanstack/react-query';
import type { CompanySummary } from '@aurora/types';
import { DataGrid, ErrorState, PageHeader, Skeleton } from '@aurora/ui';
import { useT } from '../../../../lib/i18n';
import { errorMessage, useSession } from '../../../../lib/session';

export default function CompaniesPage() {
  const t = useT();
  const { api } = useSession();
  const query = useQuery({ queryKey: ['companies'], queryFn: () => api.companies() });
  return (
    <>
      <PageHeader title={t('admin.companies')} subtitle={t('admin.companiesSubtitle')} />
      {query.isPending ? <Skeleton /> : null}
      {query.error ? <ErrorState {...errorMessage(query.error, t)} /> : null}
      {query.data ? (
        <DataGrid<CompanySummary>
          caption={t('admin.companies')}
          rows={query.data}
          emptyTitle="—"
          columns={[
            {
              key: 'code',
              header: t('common.code'),
              render: (c) => <span className="ltr-data">{c.code}</span>,
            },
            { key: 'legal', header: t('parties.legalName'), render: (c) => c.legalName },
            { key: 'trade', header: t('parties.tradeName'), render: (c) => c.tradingName ?? '—' },
            {
              key: 'country',
              header: t('common.country'),
              render: (c) => <span className="ltr-data">{c.countryCode}</span>,
            },
            {
              key: 'currency',
              header: t('admin.baseCurrency'),
              render: (c) => <span className="ltr-data">{c.baseCurrency}</span>,
            },
          ]}
        />
      ) : null}
    </>
  );
}
