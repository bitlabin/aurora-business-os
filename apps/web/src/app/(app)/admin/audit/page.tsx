'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, DataGrid, ErrorState, PageHeader, Skeleton } from '@aurora/ui';
import { useT } from '../../../../lib/i18n';
import { errorMessage, useSession } from '../../../../lib/session';

export default function AuditPage() {
  const t = useT();
  const { api } = useSession();
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const query = useQuery({
    queryKey: ['audit-all', cursor],
    queryFn: () => api.auditEvents({ limit: 100, cursor }),
  });
  return (
    <>
      <PageHeader title={t('admin.audit')} subtitle={t('admin.auditSubtitle')} />
      {query.isPending ? <Skeleton /> : null}
      {query.error ? <ErrorState {...errorMessage(query.error, t)} /> : null}
      {query.data ? (
        <DataGrid
          caption={t('admin.audit')}
          rows={query.data.items}
          emptyTitle="—"
          columns={[
            {
              key: 'seq',
              header: '#',
              render: (e) => <span className="num">{e.seq}</span>,
              numeric: true,
              width: '70px',
            },
            {
              key: 'when',
              header: t('audit.when'),
              render: (e) => new Date(e.occurredAt).toLocaleString(),
            },
            { key: 'action', header: t('audit.action'), render: (e) => <code>{e.action}</code> },
            {
              key: 'subject',
              header: t('audit.subject'),
              render: (e) => (
                <span className="ltr-data">
                  {e.subjectType} ·{' '}
                  {e.subjectId.length > 36 ? e.subjectId : e.subjectId.slice(0, 8)}
                </span>
              ),
            },
            {
              key: 'actor',
              header: t('audit.actor'),
              render: (e) => (
                <span className="mono">{e.actorUserId?.slice(0, 8) ?? e.actorType}</span>
              ),
            },
            {
              key: 'reason',
              header: t('common.reason'),
              render: (e) => <span style={{ whiteSpace: 'normal' }}>{e.reason ?? '—'}</span>,
            },
            {
              key: 'sensitive',
              header: '',
              render: (e) => (e.sensitive ? <Badge tone="warning">sensitive</Badge> : null),
            },
          ]}
          footer={
            query.data.nextCursor ? (
              <Button
                size="sm"
                onClick={() => {
                  setCursor(query.data.nextCursor ?? undefined);
                }}
              >
                {t('common.next')}
              </Button>
            ) : null
          }
        />
      ) : null}
    </>
  );
}
