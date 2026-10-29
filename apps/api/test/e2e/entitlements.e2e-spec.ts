import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DeactivationGuardRegistry } from '../../src/modules/entitlements';
import { type TestApp, as, createTestApp } from '../support/harness';

/**
 * Module entitlements (ADR-004, CORE-IND-002, CORE-IND-007, MI-004, MI-012).
 * Northwind has no inventory module at all; Harbor has it at tenant level but narrows it per
 * company through entity_capabilities.
 */
describe('module entitlements', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('MI-004: an inventory-disabled tenant cannot invoke inventory commands by raw API call', async () => {
    const owner = await as(t, 'northwind', 'owner', 'NWC');
    // The owner holds inventory.warehouse.* permissions, yet the module is disabled → 404, not 403.
    const list = await owner.get('/warehouses');
    expect(list.status).toBe(404);
    expect(list.body.code).toBe('MODULE_DISABLED');
    const create = await owner.post('/warehouses', { code: 'X', name: { en: 'x' } });
    expect(create.status).toBe(404);
    expect(create.body.code).toBe('MODULE_DISABLED');
    expect(JSON.stringify(create.body)).not.toMatch(/harbor|HDL|MAIN/i);
    // No warehouse was created for Northwind.
    const rows = await t.admin.query(
      'SELECT count(*)::int AS n FROM warehouses WHERE tenant_id = $1',
      [t.data.northwind.id],
    );
    expect(rows.rows[0].n).toBe(0);
  });

  it('entity_capabilities narrow a tenant-level module per legal entity', async () => {
    const owner = await as(t, 'harbor', 'owner', 'HDL');
    expect((await owner.get('/warehouses')).status).toBe(200);
    expect((await owner.get('/warehouses')).body.map((w: { code: string }) => w.code)).toEqual([
      'MAIN',
      'RETURNS',
    ]);
    // Same tenant, same user, retail company: the warehouse module is narrowed off (seed), inventory stays.
    const store = owner.as(t.data.harbor.companies.HRS);
    const caps = await store.get('/capabilities');
    expect(caps.status).toBe(200);
    expect(caps.body.modules).toContain('inventory');
    expect(caps.body.modules).not.toContain('warehouse');
    expect(caps.body.modules).not.toContain('manufacturing');
  });

  it('navigation is generated from entitlements ∩ permissions and contains no disabled sections', async () => {
    const consultant = await as(t, 'northwind', 'consultant', 'NWC');
    const caps = await consultant.get('/capabilities');
    expect(caps.body.navigation.map((n: { key: string }) => n.key)).toEqual([
      'home',
      'crm.parties',
      'catalog.items',
    ]);
    expect(caps.body.quickCreate.map((q: { key: string }) => q.key)).toEqual(['party']); // sales_rep may not create items
    const owner = await as(t, 'harbor', 'owner', 'HDL');
    const ownerCaps = await owner.get('/capabilities');
    expect(ownerCaps.body.navigation.map((n: { key: string }) => n.key)).toContain(
      'inventory.warehouses',
    );
    expect(ownerCaps.body.navigation.map((n: { key: string }) => n.key)).toContain('admin.modules');
  });

  it('enabling a module is audited and takes effect on the next request; core modules cannot be toggled', async () => {
    const owner = await as(t, 'northwind', 'owner', 'NWC');
    expect(
      (await owner.post('/admin/entitlements/accounting/disable', { reason: 'test' })).status,
    ).toBe(422);

    const enabled = await owner.post('/admin/entitlements/inventory/enable', {
      reason: 'Northwind Builders starts stocking materials',
    });
    expect(enabled.status).toBe(200);
    const list = await owner.get('/admin/entitlements');
    expect(
      list.body.entitlements.find((e: { module: string }) => e.module === 'inventory').enabled,
    ).toBe(true);
    expect((await owner.get('/warehouses')).status).toBe(200);

    const audit = await owner.get('/admin/audit-events?subjectType=module&subjectId=inventory');
    expect(audit.status).toBe(200);
    expect(audit.body.items.map((e: { action: string }) => e.action)).toContain(
      'entitlement.enabled',
    );
    expect(audit.body.items[0].reason).toContain('Northwind Builders');

    const disabled = await owner.post('/admin/entitlements/inventory/disable', {
      reason: 'rolled back',
    });
    expect(disabled.status).toBe(200);
    expect((await owner.get('/warehouses')).status).toBe(404);
  });

  it('MI-012: a module with open commitments cannot be deactivated; history is retained', async () => {
    const registry = t.app.get(DeactivationGuardRegistry);
    registry.register({
      module: 'purchasing',
      check: async (tenantId) =>
        tenantId === t.data.northwind.id ? ['2 purchase orders are still open'] : [],
    });
    const owner = await as(t, 'northwind', 'owner', 'NWB');
    const res = await owner.post('/admin/entitlements/purchasing/disable', { reason: 'test' });
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/2 purchase orders are still open/);
    const still = await owner.get('/admin/entitlements');
    expect(
      still.body.entitlements.find((e: { module: string }) => e.module === 'purchasing').enabled,
    ).toBe(true);
  });

  it('an auditor can read entitlements but not change them (403 + audit of the denied attempt)', async () => {
    const auditor = await as(t, 'northwind', 'auditor', 'NWC');
    expect((await auditor.get('/admin/entitlements')).status).toBe(200);
    const res = await auditor.post('/admin/entitlements/projects/enable', { reason: 'nope' });
    expect(res.status).toBe(403);
    const owner = await as(t, 'northwind', 'owner', 'NWC');
    const audit = await owner.get('/admin/audit-events?subjectType=route');
    const denied = audit.body.items.find(
      (e: { action: string; subjectId: string }) =>
        e.action === 'access.denied' && e.subjectId.includes('/admin/entitlements/'),
    );
    expect(denied).toBeDefined();
    expect(denied.reason).toMatch(/admin.entitlement.manage/);
  });
});
