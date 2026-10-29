'use client';

import { useState, type SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  DataGrid,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Panel,
  Skeleton,
  pickLocalized,
} from '@aurora/ui';
import type { Warehouse } from '@aurora/sdk';
import { useLocale, useT } from '../../../../lib/i18n';
import { errorMessage, useSession } from '../../../../lib/session';

/** Module-gated screen: the API answers 404 MODULE_DISABLED when inventory is off, and the page says so. */
export default function WarehousesPage() {
  const t = useT();
  const { locale } = useLocale();
  const qc = useQueryClient();
  const { api, can, companyId } = useSession();
  const [form, setForm] = useState({ code: '', nameEn: '', nameAr: '' });
  const query = useQuery({
    queryKey: ['warehouses', companyId],
    queryFn: () => api.warehouses(),
    enabled: Boolean(companyId),
    retry: false,
  });
  const create = useMutation({
    mutationFn: () =>
      api.createWarehouse({
        code: form.code,
        name: { en: form.nameEn, ...(form.nameAr ? { ar: form.nameAr } : {}) },
      }),
    onSuccess: () => {
      setForm({ code: '', nameEn: '', nameAr: '' });
      void qc.invalidateQueries({ queryKey: ['warehouses', companyId] });
    },
  });
  function submit(e: SyntheticEvent) {
    e.preventDefault();
    create.mutate();
  }
  return (
    <>
      <PageHeader title={t('warehouses.title')} subtitle={t('warehouses.subtitle')} />
      {query.isPending ? <Skeleton /> : null}
      {query.error ? <ErrorState {...errorMessage(query.error, t)} /> : null}
      {query.data ? (
        <div className="au-detail">
          <DataGrid<Warehouse>
            caption={t('warehouses.title')}
            rows={query.data}
            emptyTitle={t('warehouses.empty')}
            columns={[
              {
                key: 'code',
                header: t('common.code'),
                render: (w) => <span className="ltr-data">{w.code}</span>,
              },
              {
                key: 'name',
                header: t('common.name'),
                render: (w) => pickLocalized(w.name, locale),
              },
              { key: 'status', header: t('common.status'), render: (w) => w.status },
            ]}
          />
          {can('inventory.warehouse.manage') ? (
            <Panel title={t('warehouses.new')}>
              <form onSubmit={submit}>
                {create.error ? (
                  <div className="au-callout au-callout--danger">
                    {errorMessage(create.error, t).message}
                  </div>
                ) : null}
                <Field label={t('common.code')} htmlFor="wh-code" required>
                  <Input
                    id="wh-code"
                    className="ltr-data"
                    value={form.code}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, code: e.target.value }));
                    }}
                    required
                    maxLength={32}
                  />
                </Field>
                <Field label={t('common.nameEn')} htmlFor="wh-en" required>
                  <Input
                    id="wh-en"
                    value={form.nameEn}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, nameEn: e.target.value }));
                    }}
                    required
                  />
                </Field>
                <Field label={t('common.nameAr')} htmlFor="wh-ar">
                  <Input
                    id="wh-ar"
                    dir="rtl"
                    value={form.nameAr}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, nameAr: e.target.value }));
                    }}
                  />
                </Field>
                <div className="au-form-actions">
                  <Button type="submit" variant="primary" disabled={create.isPending}>
                    {t('common.create')}
                  </Button>
                </div>
              </form>
            </Panel>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
