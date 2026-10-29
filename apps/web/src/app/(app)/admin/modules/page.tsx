'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MODULE_META,
  type Entitlement,
  type IndustryPackSummary,
  type PackDiff,
} from '@aurora/types';
import {
  Badge,
  Button,
  Callout,
  DataGrid,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Panel,
  Skeleton,
  pickLocalized,
} from '@aurora/ui';
import { useLocale, useT } from '../../../../lib/i18n';
import { errorMessage, useSession } from '../../../../lib/session';

/**
 * Entitlements and industry packs (ADR-004). Every change needs a reason — it lands in the
 * audit log — and a pack is always previewed before it is installed.
 */
export default function ModulesPage() {
  const t = useT();
  const { locale } = useLocale();
  const qc = useQueryClient();
  const { api, can } = useSession();
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<
    (PackDiff & { notes: { en: string; ar: string }[] }) | null
  >(null);

  const ents = useQuery({ queryKey: ['entitlements'], queryFn: () => api.entitlements() });
  const packs = useQuery({ queryKey: ['industry-packs'], queryFn: () => api.industryPacks() });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['entitlements'] });
    void qc.invalidateQueries({ queryKey: ['industry-packs'] });
    void qc.invalidateQueries({ queryKey: ['capabilities'] });
  };
  const toggle = useMutation({
    mutationFn: (e: Entitlement) =>
      e.enabled ? api.disableModule(e.module, reason) : api.enableModule(e.module, reason),
    onSuccess: refresh,
  });
  const doPreview = useMutation({
    mutationFn: (id: string) => api.previewPack(id),
    onSuccess: (d) => {
      setPreview(d);
    },
  });
  const install = useMutation({
    mutationFn: (p: PackDiff) => api.installPack(p.packId, p.version, reason),
    onSuccess: () => {
      setPreview(null);
      refresh();
    },
  });
  const manage = can('admin.entitlement.manage');
  const canInstall = can('admin.industry_pack.install');
  const reasonOk = reason.trim().length >= 3;
  const err = toggle.error ?? install.error ?? doPreview.error;

  return (
    <>
      <PageHeader title={t('admin.modules')} subtitle={t('admin.modulesSubtitle')} />
      {manage || canInstall ? (
        <Panel>
          <Field label={t('admin.reasonPrompt')} htmlFor="reason" required>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
              }}
              maxLength={500}
            />
          </Field>
        </Panel>
      ) : null}
      <div style={{ height: 16 }} />
      {err ? <Callout tone="danger">{errorMessage(err, t).message}</Callout> : null}
      {ents.isPending ? <Skeleton /> : null}
      {ents.error ? <ErrorState {...errorMessage(ents.error, t)} /> : null}
      {ents.data ? (
        <DataGrid<Entitlement & { id: string }>
          caption={t('admin.modules')}
          rows={ents.data.entitlements.map((e) => ({ ...e, id: e.module }))}
          emptyTitle="—"
          columns={[
            {
              key: 'module',
              header: t('common.name'),
              render: (e) => pickLocalized(MODULE_META[e.module].label, locale),
            },
            {
              key: 'key',
              header: t('common.code'),
              render: (e) => <span className="ltr-data">{e.module}</span>,
            },
            {
              key: 'core',
              header: t('admin.core'),
              render: (e) => (e.core ? t('common.yes') : t('common.no')),
            },
            {
              key: 'status',
              header: t('common.status'),
              render: (e) => (
                <Badge tone={e.enabled ? 'success' : 'muted'}>
                  {e.enabled ? t('admin.enabled') : t('admin.disabled')}
                </Badge>
              ),
            },
            { key: 'reason', header: t('common.reason'), render: (e) => e.reason ?? '—' },
            {
              key: 'actions',
              header: '',
              render: (e) =>
                manage && !e.core ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      toggle.mutate(e);
                    }}
                    disabled={!reasonOk || toggle.isPending}
                  >
                    {e.enabled ? t('admin.disable') : t('admin.enable')}
                  </Button>
                ) : null,
            },
          ]}
        />
      ) : null}
      <div style={{ height: 24 }} />
      {packs.data ? (
        <DataGrid<IndustryPackSummary>
          caption="Industry packs"
          rows={packs.data}
          emptyTitle="—"
          columns={[
            { key: 'name', header: t('common.name'), render: (p) => pickLocalized(p.name, locale) },
            {
              key: 'desc',
              header: t('items.description'),
              render: (p) => (
                <span style={{ whiteSpace: 'normal' }}>{pickLocalized(p.description, locale)}</span>
              ),
            },
            {
              key: 'modules',
              header: t('admin.modules'),
              render: (p) => (
                <span className="au-chip-row">
                  {p.modules.map((m) => (
                    <Badge key={m}>{m}</Badge>
                  ))}
                </span>
              ),
            },
            {
              key: 'version',
              header: t('common.version'),
              render: (p) => <span className="ltr-data">{p.version}</span>,
            },
            {
              key: 'state',
              header: t('common.status'),
              render: (p) =>
                !p.installable ? (
                  <Badge tone="warning">{t('admin.notInstallable')}</Badge>
                ) : p.installed?.status === 'installed' ? (
                  <Badge tone="success">
                    {t('admin.installed')} {p.installed.version}
                  </Badge>
                ) : (
                  <Badge tone="muted">—</Badge>
                ),
            },
            {
              key: 'actions',
              header: '',
              render: (p) =>
                p.installable && canInstall ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      doPreview.mutate(p.id);
                    }}
                    disabled={doPreview.isPending}
                  >
                    {t('admin.preview')}
                  </Button>
                ) : null,
            },
          ]}
        />
      ) : null}
      {preview ? (
        <>
          <div style={{ height: 16 }} />
          <Panel title={`${t('admin.diff')} — ${preview.packId}@${preview.version}`}>
            {preview.conflicts.length > 0 ? (
              <Callout tone="warning">{preview.conflicts.map((c) => c.message).join('; ')}</Callout>
            ) : null}
            <dl className="au-kv">
              <dt>Modules to enable</dt>
              <dd>{preview.modulesToEnable.join(', ') || '—'}</dd>
              <dt>Already enabled</dt>
              <dd>{preview.modulesAlreadyEnabled.join(', ') || '—'}</dd>
              <dt>Roles to create</dt>
              <dd>{preview.rolesToCreate.join(', ') || '—'}</dd>
              <dt>Item categories to create</dt>
              <dd>{preview.itemCategoriesToCreate.join(', ') || '—'}</dd>
              <dt>Tables touched</dt>
              <dd className="ltr-data">{preview.touches.join(', ')}</dd>
            </dl>
            {preview.notes.length > 0 ? (
              <ul>
                {preview.notes.map((n, i) => (
                  <li key={i}>{pickLocalized(n, locale)}</li>
                ))}
              </ul>
            ) : null}
            {preview.modulesToEnable.length +
              preview.rolesToCreate.length +
              preview.itemCategoriesToCreate.length ===
              0 && preview.conflicts.length === 0 ? (
              <p>{t('admin.noChanges')}</p>
            ) : null}
            <div className="au-form-actions">
              <Button
                onClick={() => {
                  setPreview(null);
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  install.mutate(preview);
                }}
                disabled={
                  !reasonOk ||
                  install.isPending ||
                  preview.conflicts.some((c) => c.kind !== 'already_installed')
                }
              >
                {t('admin.install')}
              </Button>
            </div>
          </Panel>
        </>
      ) : null}
    </>
  );
}
