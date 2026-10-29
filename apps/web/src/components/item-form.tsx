'use client';

import { useMemo, useState, type SyntheticEvent } from 'react';
import {
  ITEM_CAPABILITIES,
  ITEM_KINDS,
  ITEM_KIND_POLICIES,
  type CreateItemRequest,
  type ItemCapability,
  type ItemCategory,
  type ItemKind,
  createItemRequestSchema,
  resolveItemCapabilities,
} from '@aurora/types';
import {
  Button,
  Callout,
  Checkbox,
  Field,
  Input,
  Select,
  Textarea,
  pickLocalized,
} from '@aurora/ui';
import { useLocale, useT } from '../lib/i18n';

const CAPABILITY_LABELS: Record<ItemCapability, { en: string; ar: string }> = {
  track_inventory: { en: 'Track inventory', ar: 'تتبع المخزون' },
  track_lot: { en: 'Track lots / batches', ar: 'تتبع الدفعات' },
  track_serial: { en: 'Track serial numbers', ar: 'تتبع الأرقام التسلسلية' },
  track_expiry: { en: 'Track expiry dates', ar: 'تتبع تواريخ الانتهاء' },
  track_location: { en: 'Track bin location', ar: 'تتبع موقع الرف' },
  is_sellable: { en: 'Sellable', ar: 'قابل للبيع' },
  is_purchasable: { en: 'Purchasable', ar: 'قابل للشراء' },
  is_billable: { en: 'Billable', ar: 'قابل للفوترة' },
  is_taxable: { en: 'Taxable', ar: 'خاضع للضريبة' },
  requires_fulfillment: { en: 'Requires fulfillment', ar: 'يتطلب تجهيزاً' },
};

/**
 * Kind-aware item form (ADR-005): the fields shown are exactly those the kind policy allows.
 * A service shows no physical section at all; stocked kinds are disabled when the inventory
 * module is off for the selected company. Validation uses the shared Zod schema; the API
 * remains the authority.
 */
export function ItemForm({
  categories,
  uoms,
  enabledModules,
  onSubmit,
  busy,
  serverError,
}: {
  categories: ItemCategory[];
  uoms: { code: string; name: { en: string; ar?: string | undefined } }[];
  enabledModules: readonly string[];
  onSubmit: (input: CreateItemRequest) => void;
  busy: boolean;
  serverError?: string | undefined;
}) {
  const t = useT();
  const { locale } = useLocale();
  const [kind, setKind] = useState<ItemKind>('SERVICE');
  const [form, setForm] = useState({
    code: '',
    nameEn: '',
    nameAr: '',
    description: '',
    categoryId: '',
    baseUomCode: uoms[0]?.code ?? 'EA',
    barcode: '',
    weightKg: '',
  });
  const [caps, setCaps] = useState<Partial<Record<ItemCapability, boolean>>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const policy = ITEM_KIND_POLICIES[kind];
  const inventoryOn = enabledModules.includes('inventory');
  const kindBlocked = policy.requiresInventoryModule && !inventoryOn;
  const effective = useMemo(() => resolveItemCapabilities(kind, caps), [kind, caps]);

  function changeKind(next: ItemKind) {
    setKind(next);
    setCaps({});
    setErrors({});
  }

  function submit(e: SyntheticEvent) {
    e.preventDefault();
    const base = {
      kind,
      code: form.code,
      name: { en: form.nameEn, ...(form.nameAr ? { ar: form.nameAr } : {}) },
      description: form.description || null,
      categoryId: form.categoryId || null,
      baseUomCode: form.baseUomCode,
      capabilities: caps,
    };
    const candidate = policy.physical
      ? {
          ...base,
          physical: {
            barcodes: form.barcode
              ? [{ value: form.barcode, symbology: 'OTHER', isPrimary: true }]
              : [],
            ...(form.weightKg ? { weightKg: form.weightKg } : {}),
          },
        }
      : base;
    const parsed = createItemRequestSchema.safeParse(candidate);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])));
      return;
    }
    if (effective.violations.length > 0) {
      setErrors(
        Object.fromEntries(
          effective.violations.map((v) => [`capabilities.${v.capability}`, v.reason]),
        ),
      );
      return;
    }
    setErrors({});
    onSubmit(parsed.data);
  }

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  return (
    <form onSubmit={submit} noValidate data-testid="item-form">
      {serverError ? <Callout tone="danger">{serverError}</Callout> : null}
      <div className="au-form-row">
        <Field label={t('items.kind')} htmlFor="kind" required>
          <Select
            id="kind"
            value={kind}
            onChange={(e) => {
              changeKind(e.target.value as ItemKind);
            }}
          >
            {ITEM_KINDS.map((k) => (
              <option
                key={k}
                value={k}
                disabled={ITEM_KIND_POLICIES[k].requiresInventoryModule && !inventoryOn}
              >
                {pickLocalized(ITEM_KIND_POLICIES[k].label, locale)}
                {ITEM_KIND_POLICIES[k].requiresInventoryModule && !inventoryOn
                  ? ' — inventory'
                  : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('common.code')} htmlFor="code" required error={errors.code}>
          <Input
            id="code"
            className="ltr-data"
            value={form.code}
            onChange={set('code')}
            maxLength={80}
            aria-invalid={Boolean(errors.code)}
          />
        </Field>
        <Field label={t('items.baseUom')} htmlFor="uom" required error={errors.baseUomCode}>
          <Select id="uom" value={form.baseUomCode} onChange={set('baseUomCode')}>
            {uoms.map((u) => (
              <option key={u.code} value={u.code}>
                {u.code} · {pickLocalized(u.name, locale)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {kindBlocked ? <Callout tone="warning">{t('items.inventoryRequired')}</Callout> : null}
      <div className="au-form-row">
        <Field label={t('common.nameEn')} htmlFor="nameEn" required error={errors['name.en']}>
          <Input
            id="nameEn"
            value={form.nameEn}
            onChange={set('nameEn')}
            maxLength={200}
            aria-invalid={Boolean(errors['name.en'])}
          />
        </Field>
        <Field label={t('common.nameAr')} htmlFor="nameAr" error={errors['name.ar']}>
          <Input
            id="nameAr"
            dir="rtl"
            value={form.nameAr}
            onChange={set('nameAr')}
            maxLength={200}
          />
        </Field>
        <Field label={t('items.category')} htmlFor="category">
          <Select id="category" value={form.categoryId} onChange={set('categoryId')}>
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {pickLocalized(c.name, locale)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label={t('items.description')} htmlFor="description">
        <Textarea
          id="description"
          value={form.description}
          onChange={set('description')}
          maxLength={4000}
        />
      </Field>

      <fieldset style={{ border: 0, padding: 0, margin: '0 0 12px' }} data-testid="capabilities">
        <legend className="au-label">{t('items.capabilities')}</legend>
        <div className="au-form-row">
          {ITEM_CAPABILITIES.filter((c) => policy.allowed.includes(c)).map((c) => (
            <div key={c}>
              <Checkbox
                label={pickLocalized(CAPABILITY_LABELS[c], locale)}
                checked={caps[c] ?? policy.defaults[c]}
                onChange={(e) => {
                  setCaps((cur) => ({ ...cur, [c]: e.target.checked }));
                }}
                disabled={c === 'track_inventory' && !inventoryOn}
              />
              {errors[`capabilities.${c}`] ? (
                <span className="au-error">{errors[`capabilities.${c}`]}</span>
              ) : null}
            </div>
          ))}
        </div>
      </fieldset>

      {policy.physical ? (
        <fieldset style={{ border: 0, padding: 0, margin: '0 0 12px' }} data-testid="physical">
          <legend className="au-label">{t('items.physical')}</legend>
          <div className="au-form-row">
            <Field
              label={t('items.barcode')}
              htmlFor="barcode"
              error={errors['physical.barcodes.0.value']}
              hint="0012345 stays 0012345"
            >
              <Input
                id="barcode"
                className="ltr-data"
                value={form.barcode}
                onChange={set('barcode')}
                maxLength={64}
              />
            </Field>
            <Field label={t('items.weight')} htmlFor="weight" error={errors['physical.weightKg']}>
              <Input
                id="weight"
                className="num"
                inputMode="decimal"
                value={form.weightKg}
                onChange={set('weightKg')}
                placeholder="0.000000"
              />
            </Field>
          </div>
        </fieldset>
      ) : (
        <Callout>{t('items.noPhysical')}</Callout>
      )}

      <div className="au-form-actions">
        <Button type="submit" variant="primary" disabled={busy || kindBlocked}>
          {t('common.create')}
        </Button>
      </div>
    </form>
  );
}
