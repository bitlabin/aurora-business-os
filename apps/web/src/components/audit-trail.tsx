'use client';

import { useQuery } from '@tanstack/react-query';
import { Callout, DataGrid, ErrorState, Skeleton } from '@aurora/ui';
import { ApiError } from '@aurora/sdk';
import { useT } from '../lib/i18n';
import { errorMessage, useSession } from '../lib/session';

/** Record-level audit tab (FDD §2.4). Requires admin.audit.read; otherwise explains why it is empty. */
export function AuditTrail({ subjectType, subjectId }: { subjectType: string; subjectId: string }) {
  const t = useT();
  const { api, can } = useSession();
  const query = useQuery({
    queryKey: ['audit', subjectType, subjectId],
    queryFn: () => api.auditEvents({ subjectType, subjectId, limit: 100 }),
    enabled: can('admin.audit.read'),
  });
  if (!can('admin.audit.read')) return <Callout>{t('common.forbidden')}</Callout>;
  if (query.isPending) return <Skeleton />;
  if (query.error)
    return (
      <ErrorState
        {...errorMessage(query.error instanceof ApiError ? query.error : query.error, t)}
      />
    );
  return (
    <DataGrid
      caption={t('common.audit')}
      rows={query.data.items}
      emptyTitle="—"
      columns={[
        {
          key: 'when',
          header: t('audit.when'),
          render: (e) => new Date(e.occurredAt).toLocaleString(),
        },
        { key: 'action', header: t('audit.action'), render: (e) => <code>{e.action}</code> },
        { key: 'reason', header: t('common.reason'), render: (e) => e.reason ?? '—' },
        {
          key: 'actor',
          header: t('audit.actor'),
          render: (e) => <span className="mono">{e.actorUserId?.slice(0, 8) ?? e.actorType}</span>,
        },
      ]}
    />
  );
}
