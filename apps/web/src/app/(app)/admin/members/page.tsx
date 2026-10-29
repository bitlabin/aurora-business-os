'use client';

import { useQuery } from '@tanstack/react-query';
import type { Member, Role } from '@aurora/sdk';
import { Badge, DataGrid, ErrorState, PageHeader, Skeleton, pickLocalized } from '@aurora/ui';
import { useLocale, useT } from '../../../../lib/i18n';
import { errorMessage, useSession } from '../../../../lib/session';

export default function MembersPage() {
  const t = useT();
  const { locale } = useLocale();
  const { api, session, can } = useSession();
  const members = useQuery({
    queryKey: ['members'],
    queryFn: () => api.members(),
    enabled: can('admin.user.read'),
  });
  const roles = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.roles(),
    enabled: can('admin.role.read'),
  });
  const companyName = (id: string) =>
    session.companies.find((c) => c.id === id)?.code ?? id.slice(0, 8);
  return (
    <>
      <PageHeader title={t('admin.members')} subtitle={t('admin.membersSubtitle')} />
      {members.isPending && can('admin.user.read') ? <Skeleton /> : null}
      {members.error ? <ErrorState {...errorMessage(members.error, t)} /> : null}
      {members.data ? (
        <DataGrid<Member>
          caption={t('admin.members')}
          rows={members.data}
          emptyTitle="—"
          columns={[
            {
              key: 'user',
              header: 'User',
              render: (m) => <span className="mono">{m.userId.slice(0, 8)}</span>,
            },
            {
              key: 'status',
              header: t('common.status'),
              render: (m) => (
                <Badge tone={m.status === 'active' ? 'success' : 'muted'}>{m.status}</Badge>
              ),
            },
            {
              key: 'roles',
              header: t('common.roles'),
              render: (m) => (
                <span className="au-chip-row">
                  {m.roles.map((r) => (
                    <Badge key={r}>{r}</Badge>
                  ))}
                </span>
              ),
            },
            {
              key: 'scopes',
              header: t('admin.scopes'),
              render: (m) => (
                <span className="au-chip-row">
                  {m.scopes.map((s) => (
                    <Badge key={s.id} tone="muted">
                      {companyName(s.id)}
                    </Badge>
                  ))}
                </span>
              ),
            },
          ]}
        />
      ) : null}
      <div style={{ height: 24 }} />
      {roles.data ? (
        <DataGrid<Role>
          caption={t('common.roles')}
          rows={roles.data}
          emptyTitle="—"
          columns={[
            {
              key: 'key',
              header: t('common.code'),
              render: (r) => <span className="ltr-data">{r.key}</span>,
            },
            { key: 'name', header: t('common.name'), render: (r) => pickLocalized(r.name, locale) },
            {
              key: 'perms',
              header: t('admin.permissions'),
              render: (r) => (
                <span className="ltr-data" style={{ whiteSpace: 'normal' }}>
                  {r.permissions.length} · {r.permissions.slice(0, 4).join(', ')}
                  {r.permissions.length > 4 ? '…' : ''}
                </span>
              ),
            },
          ]}
        />
      ) : null}
    </>
  );
}
