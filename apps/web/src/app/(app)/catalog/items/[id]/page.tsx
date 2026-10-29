'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ITEM_CAPABILITIES, ITEM_KIND_POLICIES } from '@aurora/types';
import {
  Badge,
  Button,
  Callout,
  ErrorState,
  KeyValue,
  PageHeader,
  Panel,
  Skeleton,
  Tabs,
  pickLocalized,
} from '@aurora/ui';
import { AuditTrail } from '../../../../../components/audit-trail';
import { useLocale, useT } from '../../../../../lib/i18n';
import { errorMessage, useSession } from '../../../../../lib/session';

export default function ItemDetailPage() {
  const t = useT();
  const { locale } = useLocale();
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { api, can } = useSession();
  const [tab, setTab] = useState('overview');
  const query = useQuery({ queryKey: ['item', id], queryFn: () => api.item(id) });
  const archive = useMutation({
    mutationFn: () => api.archiveItem(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['item', id] }),
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
  const i = query.data;
  const policy = ITEM_KIND_POLICIES[i.kind];

  return (
    <>
      <PageHeader
        title={pickLocalized(i.name, locale)}
        subtitle={`${pickLocalized(policy.label, locale)} · ${i.status}`}
        breadcrumb={<Link href="/catalog/items">{t('items.title')}</Link>}
        actions={
          can('catalog.item.archive') && i.status !== 'ARCHIVED' ? (
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
            <>
              <Panel>
                <KeyValue
                  rows={[
                    { label: t('common.code'), value: <span className="ltr-data">{i.code}</span> },
                    { label: t('common.nameEn'), value: i.name.en },
                    { label: t('common.nameAr'), value: i.name.ar ?? '—' },
                    {
                      label: t('items.baseUom'),
                      value: <span className="ltr-data">{i.baseUomCode}</span>,
                    },
                    { label: t('items.description'), value: i.description ?? '—' },
                  ]}
                />
              </Panel>
              <div style={{ height: 16 }} />
              {policy.physical ? (
                <Panel title={t('items.physical')}>
                  {i.physical ? (
                    <KeyValue
                      rows={[
                        {
                          label: t('items.barcode'),
                          value: i.physical.barcodes.length ? (
                            <span className="au-chip-row">
                              {i.physical.barcodes.map((b) => (
                                <Badge key={b.value}>
                                  <span className="ltr-data">{b.value}</span>
                                </Badge>
                              ))}
                            </span>
                          ) : (
                            '—'
                          ),
                        },
                        {
                          label: t('items.weight'),
                          value: <span className="num">{i.physical.weightKg ?? '—'}</span>,
                        },
                      ]}
                    />
                  ) : (
                    <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                  )}
                </Panel>
              ) : (
                <Callout>{t('items.noPhysical')}</Callout>
              )}
            </>
          ) : (
            <AuditTrail subjectType="item" subjectId={i.id} />
          )}
        </div>
        <aside className="au-detail-rail">
          <Panel title={t('items.capabilities')}>
            <div className="au-chip-row">
              {ITEM_CAPABILITIES.filter((c) => i.capabilities[c]).map((c) => (
                <Badge key={c} tone="success">
                  <span className="ltr-data">{c}</span>
                </Badge>
              ))}
            </div>
          </Panel>
          <Panel>
            <KeyValue
              rows={[
                { label: t('common.version'), value: i.version },
                { label: t('common.updated'), value: new Date(i.updatedAt).toLocaleString() },
              ]}
            />
          </Panel>
        </aside>
      </div>
    </>
  );
}
