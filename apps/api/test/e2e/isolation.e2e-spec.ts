import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type TestApp, as, createTestApp, client } from '../support/harness';

/**
 * Cross-tenant and cross-company isolation (ADR-001, SEC-004, T-001, MI-018, AT-029/030).
 * Both tenants are seeded in the same database; every assertion goes through the real HTTP
 * stack as the application role with RLS enforced.
 */
describe('tenant and company isolation', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('T-001: a Tenant A user cannot read a Tenant B party by id — 404, no existence leakage', async () => {
    const harbor = await as(t, 'harbor', 'owner', 'HDL');
    const harborParties = await harbor.get('/parties');
    expect(harborParties.status).toBe(200);
    const target = harborParties.body.items[0];
    expect(target).toBeDefined();

    const northwind = await as(t, 'northwind', 'owner', 'NWC');
    const res = await northwind.get(`/parties/${target.id}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(JSON.stringify(res.body)).not.toContain(target.legalName);
  });

  it("lists never contain the other tenant's rows", async () => {
    const northwind = await as(t, 'northwind', 'owner', 'NWC');
    const res = await northwind.get('/parties?limit=200');
    expect(res.status).toBe(200);
    for (const p of res.body.items) expect(p.tenantId).toBe(t.data.northwind.id);
    expect(res.body.items.map((p: { legalName: string }) => p.legalName)).not.toContain(
      'Al-Noor Pharmacy (DEMO)',
    );
  });

  it('a Tenant A user cannot update, archive or re-role a Tenant B record', async () => {
    const harbor = await as(t, 'harbor', 'owner', 'HDL');
    const target = (await harbor.get('/parties')).body.items[0];
    const northwind = await as(t, 'northwind', 'owner', 'NWC');
    expect((await northwind.patch(`/parties/${target.id}`, { legalName: 'Hijacked' })).status).toBe(
      404,
    );
    expect((await northwind.post(`/parties/${target.id}/roles`, { role: 'SUPPLIER' })).status).toBe(
      404,
    );
    expect((await northwind.delete(`/parties/${target.id}`)).status).toBe(404);
    const after = await harbor.get(`/parties/${target.id}`);
    expect(after.body.legalName).toBe(target.legalName);
    expect(after.body.version).toBe(target.version);
  });

  it('MI-018: a user scoped to one company cannot select another company of the same tenant', async () => {
    const consultant = await as(t, 'northwind', 'consultant', 'NWC');
    expect((await consultant.get('/parties')).status).toBe(200);
    // NWB is a company of the same tenant, but the consultant holds no scope grant for it.
    const other = consultant.as(t.data.northwind.companies.NWB);
    const res = await other.get('/parties');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('a guessed company id from another tenant is never honoured', async () => {
    const northwind = await as(t, 'northwind', 'owner');
    const res = await northwind.as(t.data.harbor.companies.HDL).get('/parties');
    expect(res.status).toBe(403);
  });

  it('/companies shows only companies the caller is scoped to', async () => {
    const consultant = await as(t, 'northwind', 'consultant');
    const res = await consultant.get('/companies');
    expect(res.status).toBe(200);
    expect(res.body.map((c: { code: string }) => c.code)).toEqual(['NWC']);
    const direct = await consultant.get(`/companies/${t.data.northwind.companies.NWB}`);
    expect(direct.status).toBe(404);
  });

  it('a session token from one tenant does not work as another tenant', async () => {
    const harborUser = t.data.harbor.users.owner!;
    // Logging into a tenant the user is not a member of fails with the generic credential error.
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: harborUser.email,
        password: 'Demo!Pass123',
        tenantSlug: t.data.northwind.slug,
      },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('Invalid email or password');
  });

  it('RLS at the SQL level: the application role sees nothing without a tenant context and only its tenant with one', async () => {
    const { Pool } = await import('pg');
    const appPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    try {
      const none = await appPool.query('SELECT count(*)::int AS n FROM parties');
      expect(none.rows[0].n).toBe(0);
      const c = await appPool.connect();
      try {
        await c.query('BEGIN');
        await c.query("SELECT set_config('app.tenant_id', $1, true)", [t.data.northwind.id]);
        const scoped = await c.query('SELECT DISTINCT tenant_id FROM parties');
        expect(scoped.rows.map((r) => r.tenant_id)).toEqual([t.data.northwind.id]);
        // Writing a row for another tenant inside this context is rejected by the policy.
        await expect(
          c.query(
            `INSERT INTO parties (id, tenant_id, type, legal_name, legal_name_normalized) VALUES (gen_random_uuid(), $1, 'PERSON', 'x', 'x')`,
            [t.data.harbor.id],
          ),
        ).rejects.toThrow(/row-level security/);
        await c.query('ROLLBACK');
      } finally {
        c.release();
      }
    } finally {
      await appPool.end();
    }
  });

  it('a public client without a session gets 401 on every protected route', async () => {
    const anon = client(t.app, 'not-a-token');
    for (const path of [
      '/parties',
      '/items',
      '/companies',
      '/capabilities',
      '/admin/audit-events',
    ]) {
      const res = await anon.get(path);
      expect(res.status, path).toBe(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    }
  });
});
