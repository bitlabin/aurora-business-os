'use client';

import { useState, type SyntheticEvent } from 'react';
import { ApiError } from '@aurora/sdk';
import { Button, Callout, Field, Input, Select } from '@aurora/ui';
import { useLocale, useT } from '../../lib/i18n';
import { baseClient } from '../../lib/session';

export default function LoginPage() {
  const t = useT();
  const { locale, setLocale } = useLocale();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState<string | undefined>(undefined);
  const [tenants, setTenants] = useState<{ slug: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function submit(e: SyntheticEvent) {
    e.preventDefault();
    void doLogin();
  }

  async function doLogin() {
    setBusy(true);
    setError(null);
    try {
      const res = await baseClient.login({
        email,
        password,
        ...(tenantSlug ? { tenantSlug } : {}),
      });
      if (res.status === 'tenant_required') {
        setTenants(res.tenants);
        setTenantSlug(res.tenants[0]?.slug);
        return;
      }
      const next = new URLSearchParams(window.location.search).get('next');
      window.location.href = next?.startsWith('/') ? next : '/home';
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="au-login">
      <form className="au-panel" onSubmit={submit} aria-labelledby="login-title">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span className="au-brand-mark" />
          <strong>{t('app.name')}</strong>
          <span style={{ marginInlineStart: 'auto' }}>
            <Select
              aria-label={t('nav.language')}
              value={locale}
              onChange={(e) => {
                setLocale(e.target.value as 'en' | 'ar');
              }}
              style={{ height: 28 }}
            >
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </Select>
          </span>
        </div>
        <h1 id="login-title" className="au-page-title" style={{ marginBottom: 16 }}>
          {t('login.title')}
        </h1>
        {error ? <Callout tone="danger">{error}</Callout> : null}
        <Field label={t('login.email')} htmlFor="email" required>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
            }}
            required
          />
        </Field>
        <Field label={t('login.password')} htmlFor="password" required>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
            required
          />
        </Field>
        {tenants.length > 0 ? (
          <Field label={t('login.tenant')} htmlFor="tenant" hint={t('login.chooseTenant')}>
            <Select
              id="tenant"
              value={tenantSlug}
              onChange={(e) => {
                setTenantSlug(e.target.value);
              }}
            >
              {tenants.map((x) => (
                <option key={x.slug} value={x.slug}>
                  {x.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Button
          type="submit"
          variant="primary"
          disabled={busy}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {t('login.submit')}
        </Button>
      </form>
    </main>
  );
}
