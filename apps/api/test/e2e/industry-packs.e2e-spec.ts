import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type TestApp, as, createTestApp } from '../support/harness';

/** Industry packs: preview → install with immutable history (CORE-IND-003, MI-011, F-PACK-10). */
describe('industry packs', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  async function rowCounts(tenantId: string): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const table of ['parties', 'items', 'companies', 'audit_events']) {
      const r = await t.admin.query(
        `SELECT count(*)::int AS n FROM ${table} WHERE tenant_id = $1`,
        [tenantId],
      );
      out[table] = r.rows[0].n;
    }
    return out;
  }

  it('lists every pack with installed state; roadmap packs are visible but not installable', async () => {
    const owner = await as(t, 'northwind', 'owner');
    const res = await owner.get('/industry-packs');
    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.map((p: { id: string }) => [p.id, p]));
    expect(byId['general-business'].installed.status).toBe('installed');
    expect(byId['construction'].installed.status).toBe('installed');
    expect(byId['retail'].installed).toBeNull();
    expect(byId['nonprofit'].installable).toBe(false);
  });

  it('MI-011: preview shows the exact delta; install writes an immutable history row and touches no business records', async () => {
    const owner = await as(t, 'northwind', 'owner');
    const preview = await owner.post('/industry-packs/professional-services/preview');
    expect(preview.status).toBe(200);
    expect(preview.body.modulesToEnable).toEqual([]); // projects already enabled by the construction pack
    expect(preview.body.modulesAlreadyEnabled).toEqual(['projects']);
    expect(preview.body.itemCategoriesToCreate).toEqual(['CONSULTING', 'RETAINERS']);
    expect(preview.body.conflicts).toEqual([]);
    expect(preview.body.touches).not.toContain('items');
    expect(preview.body.touches).not.toContain('parties');

    const before = await rowCounts(t.data.northwind.id);
    const install = await owner.post('/industry-packs/professional-services/install', {
      version: preview.body.version,
      reason: 'Consulting arm goes live',
    });
    expect(install.status).toBe(200);
    const after = await rowCounts(t.data.northwind.id);
    expect(after.parties).toBe(before.parties);
    expect(after.items).toBe(before.items);
    expect(after.companies).toBe(before.companies);
    expect(after.audit_events).toBeGreaterThan(before.audit_events ?? 0);

    const history = await t.admin.query(
      `SELECT action, from_version, to_version, diff, reason FROM config_install_events WHERE tenant_id = $1 AND pack_id = 'professional-services'`,
      [t.data.northwind.id],
    );
    expect(history.rows).toHaveLength(1);
    expect(history.rows[0].action).toBe('install');
    expect(history.rows[0].from_version).toBeNull();
    expect(history.rows[0].diff.itemCategoriesToCreate).toEqual(['CONSULTING', 'RETAINERS']);
    expect(history.rows[0].reason).toBe('Consulting arm goes live');
    // append-only: even the admin role cannot rewrite history
    await expect(
      t.admin.query(`UPDATE config_install_events SET reason = 'x' WHERE tenant_id = $1`, [
        t.data.northwind.id,
      ]),
    ).rejects.toThrow(/append-only/);

    const categories = await owner.as(t.data.northwind.companies.NWC).get('/item-categories');
    expect(categories.body.map((c: { code: string }) => c.code)).toEqual(
      expect.arrayContaining(['CONSULTING', 'RETAINERS', 'SERVICES', 'LABOR']),
    );
  });

  it('installation requires the previewed version and rejects re-installing the same version', async () => {
    const owner = await as(t, 'northwind', 'owner');
    expect(
      (
        await owner.post('/industry-packs/professional-services/install', {
          version: '9.9.9',
          reason: 'wrong version',
        })
      ).status,
    ).toBe(409);
    const again = await owner.post('/industry-packs/professional-services/install', {
      version: '1.0.0',
      reason: 'again',
    });
    expect(again.status).toBe(409);
  });

  it('F-PACK-10: a roadmap pack cannot be installed', async () => {
    const owner = await as(t, 'northwind', 'owner');
    const preview = await owner.post('/industry-packs/nonprofit/preview');
    expect(preview.body.conflicts.map((c: { kind: string }) => c.kind)).toContain(
      'not_installable',
    );
    const res = await owner.post('/industry-packs/nonprofit/install', {
      version: preview.body.version,
      reason: 'try roadmap pack',
    });
    expect(res.status).toBe(422);
  });

  it('removing a pack disables only modules no other installed pack needs, and keeps the history', async () => {
    const owner = await as(t, 'northwind', 'owner');
    // construction (projects, purchasing) and professional-services (projects) are both installed.
    const res = await owner.delete('/industry-packs/construction', { reason: 'Builders spun off' });
    expect(res.status).toBe(200);
    const ents = (await owner.get('/admin/entitlements')).body.entitlements as {
      module: string;
      enabled: boolean;
    }[];
    expect(ents.find((e) => e.module === 'projects')?.enabled).toBe(true); // still needed by professional-services
    expect(ents.find((e) => e.module === 'purchasing')?.enabled).toBe(false);
    const packs = (await owner.get('/industry-packs')).body as {
      id: string;
      installed: { status: string } | null;
    }[];
    expect(packs.find((p) => p.id === 'construction')?.installed?.status).toBe('removed');
    const history = await t.admin.query(
      `SELECT action FROM config_install_events WHERE tenant_id = $1 AND pack_id = 'construction' ORDER BY applied_at`,
      [t.data.northwind.id],
    );
    expect(history.rows.map((r) => r.action)).toEqual(['install', 'remove']);
  });

  it('only admin.industry_pack.install may install', async () => {
    const auditor = await as(t, 'northwind', 'auditor');
    expect((await auditor.get('/industry-packs')).status).toBe(200);
    expect(
      (
        await auditor.post('/industry-packs/retail/install', {
          version: '1.0.0',
          reason: 'auditor try',
        })
      ).status,
    ).toBe(403);
  });
});
