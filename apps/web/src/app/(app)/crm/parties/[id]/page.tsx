'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PARTY_ROLES, type PartyRole } from '@aurora/types';
import {
  Badge,
  Button,
  ErrorState,
  KeyValue,
  PageHeader,
  Panel,
  Select,
  Skeleton,
  Tabs,
} from '@aurora/ui';
import { AuditTrail } from '../../../../../components/audit-trail';
import { useT } from '../../../../../lib/i18n';
import { errorMessage, useSession } from '../../../../../lib/session';

export default function PartyDetailPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { api, can } = useSession();
  const [tab, setTab] = useState('overview');
  const [newRole, setNewRole] = useState<PartyRole>('SUPPLIER');

  const query = useQuery({ queryKey: ['party', id], queryFn: () => api.party(id) });
  const addRole = useMutation({
    mutationFn: (role: PartyRole) => api.addPartyRole(id, role),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['party', id] }),
  });
  const archive = useMutation({
    mutationFn: () => api.archiveParty(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['party', id] }),
  });

  if (query.isPending) return <Skeleton />;
  if (query.error)
    return (
      <ErrorState
        {...errorMessage(query.error, t)}
        retry={() => void query.refetch()}
        retryLabel={t('common.retry')}
      />
    );
  const p = query.data;
  const available = PARTY_ROLES.filter((r) => !p.roles.includes(r));

  return (
    <>
      <PageHeader
        title={p.legalName}
        subtitle={`${t(`parties.${p.type}`)} · ${p.status}`}
        breadcrumb={<Link href="/crm/parties">{t('parties.title')}</Link>}
        actions={
          can('crm.party.archive') && p.status !== 'ARCHIVED' ? (
            <Button
              variant="danger"
              onClick={() => {
                archive.mutate();
              }}
              disabled={archive.isPending}
            >
              {t('common.archive')}
            </Button>
          ) : null
        }
      />
      <div className="au-detail">
        <div>
          <Tabs
            tabs={[
              { key: 'overview', label: t('common.overview') },
              { key: 'audit', label: t('common.audit') },
            ]}
            active={tab}
            onChange={setTab}
          />
          {tab === 'overview' ? (
            <Panel>
              <KeyValue
                rows={[
                  { label: t('parties.legalName'), value: p.legalName },
                  { label: t('parties.tradeName'), value: p.tradeName ?? '—' },
                  {
                    label: t('common.email'),
                    value: <span className="ltr-data">{p.primaryEmail ?? '—'}</span>,
                  },
                  {
                    label: t('common.phone'),
                    value: <span className="ltr-data">{p.primaryPhone ?? '—'}</span>,
                  },
                  {
                    label: t('common.country'),
                    value: <span className="ltr-data">{p.countryCode ?? '—'}</span>,
                  },
                  {
                    label: t('parties.taxId'),
                    value: <span className="ltr-data">{p.taxRegistrationId ?? '—'}</span>,
                  },
                  {
                    label: t('common.tags'),
                    value: p.tags.length ? (
                      <span className="au-chip-row">
                        {p.tags.map((x) => (
                          <Badge key={x} tone="muted">
                            {x}
                          </Badge>
                        ))}
                      </span>
                    ) : (
                      '—'
                    ),
                  },
                ]}
              />
            </Panel>
          ) : (
            <AuditTrail subjectType="party" subjectId={p.id} />
          )}
        </div>
        <aside className="au-detail-rail">
          <Panel title={t('common.roles')}>
            <div className="au-chip-row">
              {p.roles.map((r) => (
                <Badge key={r}>{r}</Badge>
              ))}
            </div>
            {can('crm.party.update') && available.length > 0 ? (
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <Select
                  value={newRole}
                  onChange={(e) => {
                    setNewRole(e.target.value as PartyRole);
                  }}
                  aria-label={t('parties.addRole')}
                >
                  {available.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
                <Button
                  size="sm"
                  onClick={() => {
                    addRole.mutate(newRole);
                  }}
                  disabled={addRole.isPending}
                >
                  {t('parties.addRole')}
                </Button>
              </div>
            ) : null}
            {addRole.error ? (
              <div className="au-error">{errorMessage(addRole.error, t).message}</div>
            ) : null}
          </Panel>
          <Panel>
            <KeyValue
              rows={[
                { label: t('common.version'), value: p.version },
                { label: t('common.updated'), value: new Date(p.updatedAt).toLocaleString() },
              ]}
            />
          </Panel>
        </aside>
      </div>
    </>
  );
}
