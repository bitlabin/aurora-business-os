'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ITEM_KINDS, ITEM_KIND_POLICIES, type Item, type ItemKind } from '@aurora/types';
import {
  Badge,
  Button,
  DataGrid,
  ErrorState,
  Input,
  PageHeader,
  Select,
  Skeleton,
  pickLocalized,
} from '@aurora/ui';
import { useLocale, useT } from '../../../../lib/i18n';
import { errorMessage, useSession } from '../../../../lib/session';

const STATUS_TONE = {
  DRAFT: 'muted',
  ACTIVE: 'success',
  DISCONTINUED: 'warning',
  ARCHIVED: 'muted',
} as const;

export default function ItemsPage() {
  const t = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const { api, can, companyId } = useSession();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<ItemKind | ''>('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const query = useQuery({
    queryKey: ['items', companyId, q, kind, cursor],
    queryFn: () => api.items({ q: q || undefined, kind: kind || undefined, cursor, limit: 50 }),
    enabled: Boolean(companyId),
  });

  function tracking(i: Item): string {
    const flags = [
      i.capabilities.track_inventory ? 'stock' : null,
      i.capabilities.track_lot ? 'lot' : null,
      i.capabilities.track_expiry ? 'expiry' : null,
      i.capabilities.track_serial ? 'serial' : null,
    ].filter(Boolean);
    return flags.length ? flags.join(' · ') : '—';
  }

  return (
    <>
      <PageHeader
        title={t('items.title')}
        subtitle={t('items.subtitle')}
        actions={
          can('catalog.item.create') ? (
            <Link href="/catalog/items/new" className="au-btn au-btn--primary">
              {t('items.new')}
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
        <DataGrid<Item>
          caption={t('items.title')}
          rows={query.data.items}
          onRowClick={(i) => {
            router.push(`/catalog/items/${i.id}`);
          }}
          emptyTitle={t('items.empty')}
          emptyHint={t('items.emptyHint')}
          columns={[
            {
              key: 'code',
              header: t('common.code'),
              render: (i) => (
                <Link href={`/catalog/items/${i.id}`} className="ltr-data">
                  {i.code}
                </Link>
              ),
            },
            { key: 'name', header: t('common.name'), render: (i) => pickLocalized(i.name, locale) },
            {
              key: 'kind',
              header: t('items.kind'),
              render: (i) => (
                <Badge>{pickLocalized(ITEM_KIND_POLICIES[i.kind].label, locale)}</Badge>
              ),
            },
            {
              key: 'uom',
              header: t('items.baseUom'),
              render: (i) => <span className="ltr-data">{i.baseUomCode}</span>,
            },
            {
              key: 'tracking',
              header: 'Tracking',
              render: (i) => <span className="ltr-data">{tracking(i)}</span>,
            },
            {
              key: 'status',
              header: t('common.status'),
              render: (i) => <Badge tone={STATUS_TONE[i.status]}>{i.status}</Badge>,
            },
          ]}
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
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as ItemKind | '');
                  setCursor(undefined);
                }}
                aria-label={t('items.kind')}
              >
                <option value="">{t('common.all')}</option>
                {ITEM_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {pickLocalized(ITEM_KIND_POLICIES[k].label, locale)}
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
