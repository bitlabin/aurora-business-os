'use client';

import { useState, type SyntheticEvent } from 'react';
import {
  PARTY_ROLES,
  type CreatePartyRequest,
  type PartyRole,
  createPartyRequestSchema,
} from '@aurora/types';
import { Button, Checkbox, Field, Input, Select } from '@aurora/ui';
import { useT } from '../lib/i18n';

/** Create form validated client-side with the same Zod schema the API uses. The API remains authoritative. */
export function PartyForm({
  onSubmit,
  busy,
  serverError,
}: {
  onSubmit: (input: CreatePartyRequest) => void;
  busy: boolean;
  serverError?: string | undefined;
}) {
  const t = useT();
  const [form, setForm] = useState({
    type: 'ORGANIZATION',
    legalName: '',
    tradeName: '',
    primaryEmail: '',
    primaryPhone: '',
    countryCode: '',
    taxRegistrationId: '',
    tags: '',
  });
  const [roles, setRoles] = useState<PartyRole[]>(['CUSTOMER']);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(e: SyntheticEvent) {
    e.preventDefault();
    const candidate = {
      type: form.type,
      legalName: form.legalName,
      tradeName: form.tradeName || null,
      primaryEmail: form.primaryEmail || null,
      primaryPhone: form.primaryPhone || null,
      countryCode: form.countryCode || null,
      taxRegistrationId: form.taxRegistrationId || null,
      tags: form.tags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      roles,
    };
    const parsed = createPartyRequestSchema.safeParse(candidate);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])));
      return;
    }
    setErrors({});
    onSubmit(parsed.data);
  }

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  return (
    <form onSubmit={submit} noValidate>
      {serverError ? (
        <div className="au-callout au-callout--danger" role="alert">
          {serverError}
        </div>
      ) : null}
      <div className="au-form-row">
        <Field label={t('common.type')} htmlFor="type" required>
          <Select id="type" value={form.type} onChange={set('type')}>
            <option value="ORGANIZATION">{t('parties.ORGANIZATION')}</option>
            <option value="PERSON">{t('parties.PERSON')}</option>
          </Select>
        </Field>
        <Field label={t('parties.legalName')} htmlFor="legalName" required error={errors.legalName}>
          <Input
            id="legalName"
            value={form.legalName}
            onChange={set('legalName')}
            aria-invalid={Boolean(errors.legalName)}
            maxLength={200}
          />
        </Field>
        <Field label={t('parties.tradeName')} htmlFor="tradeName" error={errors.tradeName}>
          <Input
            id="tradeName"
            value={form.tradeName}
            onChange={set('tradeName')}
            maxLength={200}
          />
        </Field>
      </div>
      <div className="au-form-row">
        <Field
          label={t('common.email')}
          htmlFor="email"
          error={errors.primaryEmail}
          hint={t('parties.contactHint')}
        >
          <Input
            id="email"
            type="email"
            className="ltr-data"
            value={form.primaryEmail}
            onChange={set('primaryEmail')}
            aria-invalid={Boolean(errors.primaryEmail)}
          />
        </Field>
        <Field
          label={t('common.phone')}
          htmlFor="phone"
          error={errors.primaryPhone}
          hint="+9647xxxxxxxxx"
        >
          <Input
            id="phone"
            type="tel"
            className="ltr-data"
            value={form.primaryPhone}
            onChange={set('primaryPhone')}
            aria-invalid={Boolean(errors.primaryPhone)}
          />
        </Field>
        <Field
          label={t('common.country')}
          htmlFor="country"
          error={errors.countryCode}
          hint="ISO 3166-1 alpha-2"
        >
          <Input
            id="country"
            className="ltr-data"
            value={form.countryCode}
            onChange={(e) => {
              setForm((f) => ({ ...f, countryCode: e.target.value.toUpperCase() }));
            }}
            maxLength={2}
          />
        </Field>
      </div>
      <div className="au-form-row">
        <Field
          label={t('parties.taxId')}
          htmlFor="taxId"
          hint={t('parties.taxIdHint')}
          error={errors.taxRegistrationId}
        >
          <Input
            id="taxId"
            className="ltr-data"
            value={form.taxRegistrationId}
            onChange={set('taxRegistrationId')}
            maxLength={64}
          />
        </Field>
        <Field label={t('common.tags')} htmlFor="tags" hint="a, b, c">
          <Input id="tags" value={form.tags} onChange={set('tags')} />
        </Field>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: '0 0 12px' }}>
        <legend className="au-label">{t('common.roles')}</legend>
        {errors.roles ? <span className="au-error">{errors.roles}</span> : null}
        <div className="au-chip-row">
          {PARTY_ROLES.map((r) => (
            <Checkbox
              key={r}
              label={r}
              checked={roles.includes(r)}
              onChange={(e) => {
                setRoles((cur) => (e.target.checked ? [...cur, r] : cur.filter((x) => x !== r)));
              }}
            />
          ))}
        </div>
      </fieldset>
      <div className="au-form-actions">
        <Button type="submit" variant="primary" disabled={busy}>
          {t('common.create')}
        </Button>
      </div>
    </form>
  );
}
