'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PARTY_ROLES, type Party, type PartyRole } from '@aurora/types';
import {
  Badge,
  Button,
  DataGrid,
  ErrorState,
  Input,
  PageHeader,
  Select,
  Skeleton,
} from '@aurora/ui';
import { useT } from '../../../../lib/i18n';
import type { MessageKey } from '../../../../lib/i18n-core';
import { errorMessage, useSession } from '../../../../lib/session';

const STATUS_TONE = {
  ACTIVE: 'success',
  ON_HOLD: 'warning',
  BLOCKED: 'danger',
  ARCHIVED: 'muted',
} as const;

function roleFromUrl(value: string | null): PartyRole | '' {
  return value && (PARTY_ROLES as readonly string[]).includes(value) ? (value as PartyRole) : '';
}

/** Page title follows the sidebar entry: Customers, Suppliers, Prospects … or all parties. */
function titleKey(role: PartyRole | ''): MessageKey {
  if (role === 'CUSTOMER') return 'parties.titleCustomers';
  if (role === 'SUPPLIER') return 'parties.titleSuppliers';
  if (role === 'PROSPECT') return 'parties.titleProspects';
  return 'parties.title';
}

function newLabelKey(role: PartyRole | ''): MessageKey {
  if (role === 'CUSTOMER') return 'parties.newCustomer';
  if (role === 'SUPPLIER') return 'parties.newSupplier';
  if (role === 'PROSPECT') return 'parties.newProspect';
  return 'parties.new';
}

export default function PartiesPage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <PartiesList />
    </Suspense>
  );
}

function PartiesList() {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { api, can, companyId } = useSession();
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const role = roleFromUrl(searchParams.get('role'));
  const setRole = (next: PartyRole | '') => {
    router.replace(next ? `/crm/parties?role=${next}` : '/crm/parties');
  };

  const query = useQuery({
    queryKey: ['parties', companyId, q, role, cursor],
    queryFn: () => api.parties({ q: q || undefined, role: role || undefined, cursor, limit: 50 }),
    enabled: Boolean(companyId),
  });

  const columns = [
    {
      key: 'name',
      header: t('parties.legalName'),
      render: (p: Party) => <Link href={`/crm/parties/${p.id}`}>{p.legalName}</Link>,
    },
    { key: 'type', header: t('common.type'), render: (p: Party) => t(`parties.${p.type}`) },
    {
      key: 'roles',
      header: t('common.roles'),
      render: (p: Party) => (
        <span className="au-chip-row">
          {p.roles.map((r) => (
            <Badge key={r}>{r}</Badge>
          ))}
        </span>
      ),
    },
    {
      key: 'email',
      header: t('common.email'),
      render: (p: Party) => <span className="ltr-data">{p.primaryEmail ?? '—'}</span>,
    },
    {
      key: 'phone',
      header: t('common.phone'),
      render: (p: Party) => <span className="ltr-data">{p.primaryPhone ?? '—'}</span>,
    },
    {
      key: 'status',
      header: t('common.status'),
      render: (p: Party) => <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>,
    },
  ];

  return (
    <>
      <PageHeader
        title={t(titleKey(role))}
        subtitle={t('parties.subtitle')}
        actions={
          can('crm.party.create') ? (
            <Link
              href={role ? `/crm/parties/new?role=${role}` : '/crm/parties/new'}
              className="au-btn au-btn--primary"
            >
              {t(newLabelKey(role))}
            </Link>
          ) : null
        }
      />
      {query.isPending ? <Skeleton /> : null}
      {query.error ? (
        <ErrorState
          {...errorMessage(query.error, t)}
          retry={() => void query.refetch()}
          retryLabel={t('common.retry')}
        />
      ) : null}
      {query.data ? (
        <DataGrid<Party>
          caption={t(titleKey(role))}
          columns={columns}
          rows={query.data.items}
          onRowClick={(p) => {
            router.push(`/crm/parties/${p.id}`);
          }}
          emptyTitle={t('parties.empty')}
          emptyHint={t('parties.emptyHint')}
          toolbar={
            <>
              <Input
                placeholder={t('common.search')}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setCursor(undefined);
                }}
                aria-label={t('common.search')}
              />
              <Select
                value={role}
                onChange={(e) => {
                  setRole(e.target.value as PartyRole | '');
                  setCursor(undefined);
                }}
                aria-label={t('common.roles')}
              >
                <option value="">{t('common.all')}</option>
                {PARTY_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </>
          }
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
