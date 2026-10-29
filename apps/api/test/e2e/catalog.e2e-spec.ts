import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type TestApp, as, createTestApp } from '../support/harness';

/** Universal item model (ADR-005, MI-001, MI-009, MI-022, T-022). */
describe('catalog: items and item kinds', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('MI-001: a service item is created and displayed with no warehouse, barcode, expiry or lot', async () => {
    const owner = await as(t, 'northwind', 'owner', 'NWC');
    const res = await owner.post('/items', {
      kind: 'SERVICE',
      code: 'ADVISORY-RETAINER',
      name: { en: 'Monthly advisory retainer', ar: 'عقد استشاري شهري' },
      baseUomCode: 'MONTH',
    });
    expect(res.status).toBe(201);
    expect(res.body.kind).toBe('SERVICE');
    expect(res.body.physical).toBeNull();
    expect(res.body.capabilities).toMatchObject({
      track_inventory: false,
      track_lot: false,
      track_serial: false,
      track_expiry: false,
      is_billable: true,
    });
    expect(Object.keys(res.body)).not.toContain('warehouseId');

    const shown = await owner.get(`/items/${res.body.id}`);
    expect(shown.status).toBe(200);
    expect(shown.body.baseUomCode).toBe('MONTH');
    expect(shown.body.physical).toBeNull();
  });

  it('physical attributes on a service are rejected at the schema boundary (400, field path)', async () => {
    const owner = await as(t, 'northwind', 'owner', 'NWC');
    const res = await owner.post('/items', {
      kind: 'SERVICE',
      code: 'BAD-SVC',
      name: { en: 'x' },
      baseUomCode: 'HOUR',
      physical: { barcodes: [{ value: '0012345' }] },
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    const tracking = await owner.post('/items', {
      kind: 'SERVICE',
      code: 'BAD-SVC-2',
      name: { en: 'x' },
      baseUomCode: 'HOUR',
      capabilities: { track_lot: true },
    });
    expect(tracking.status).toBe(422);
    expect(tracking.body.fieldErrors.map((f: { path: string }) => f.path)).toContain(
      'capabilities.track_lot',
    );
  });

  it('CORE-IND-002: a stocked good cannot be created for a company without the inventory module', async () => {
    const owner = await as(t, 'northwind', 'owner', 'NWC');
    const res = await owner.post('/items', {
      kind: 'STOCKED_GOOD',
      code: 'WIDGET',
      name: { en: 'Widget' },
      baseUomCode: 'EA',
    });
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/inventory module/);
  });

  it('MI-022: a nonstock good needs no warehouse and never tracks stock', async () => {
    const owner = await as(t, 'northwind', 'owner', 'NWB');
    const res = await owner.post('/items', {
      kind: 'NONSTOCK_GOOD',
      code: 'REBAR-T',
      name: { en: 'Rebar (per tonne)' },
      baseUomCode: 'EA',
      capabilities: { is_purchasable: true },
    });
    expect(res.status).toBe(201);
    expect(res.body.capabilities.track_inventory).toBe(false);
    expect(res.body.capabilities.is_purchasable).toBe(true);
  });

  it('MI-009 / T-022: a serial-tracked stocked good without expiry, and barcodes keep leading zeros', async () => {
    const stock = await as(t, 'harbor', 'stock', 'HDL');
    const res = await stock.post('/items', {
      kind: 'STOCKED_GOOD',
      code: 'PRINTER-Z2',
      name: { en: 'Label printer Z2', ar: 'طابعة ملصقات Z2' },
      baseUomCode: 'EA',
      capabilities: { track_serial: true },
      physical: {
        barcodes: [{ value: '00098765', symbology: 'OTHER', isPrimary: true }],
        weightKg: '1.250000',
      },
    });
    expect(res.status).toBe(201);
    expect(res.body.capabilities).toMatchObject({
      track_inventory: true,
      track_serial: true,
      track_lot: false,
      track_expiry: false,
    });
    expect(res.body.physical.barcodes[0].value).toBe('00098765');
    expect(res.body.physical.weightKg).toBe('1.250000');

    const dup = await stock.post('/items', {
      kind: 'STOCKED_GOOD',
      code: 'PRINTER-Z3',
      name: { en: 'x' },
      baseUomCode: 'EA',
      physical: { barcodes: [{ value: '00098765' }] },
    });
    expect(dup.status).toBe(409);
  });

  it('lot + expiry is a per-item choice; expiry without lot is rejected', async () => {
    const stock = await as(t, 'harbor', 'stock', 'HDL');
    const bad = await stock.post('/items', {
      kind: 'STOCKED_GOOD',
      code: 'EXP-ONLY',
      name: { en: 'x' },
      baseUomCode: 'EA',
      capabilities: { track_expiry: true },
    });
    expect(bad.status).toBe(422);
    const ok = await stock.post('/items', {
      kind: 'STOCKED_GOOD',
      code: 'SUNSCREEN-50',
      name: { en: 'Sunscreen SPF50' },
      baseUomCode: 'EA',
      capabilities: { track_lot: true, track_expiry: true },
    });
    expect(ok.status).toBe(201);
  });

  it('item codes are unique per tenant case-insensitively, and listing supports kind filter + keyset pagination', async () => {
    const owner = await as(t, 'northwind', 'owner', 'NWC');
    expect(
      (
        await owner.post('/items', {
          kind: 'SERVICE',
          code: 'consult-hr',
          name: { en: 'dup' },
          baseUomCode: 'HOUR',
        })
      ).status,
    ).toBe(409);
    const page1 = await owner.get('/items?kind=SERVICE&limit=2');
    expect(page1.status).toBe(200);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.nextCursor).not.toBeNull();
    const page2 = await owner.get(`/items?kind=SERVICE&limit=2&cursor=${page1.body.nextCursor}`);
    expect(page2.status).toBe(200);
    const ids1 = page1.body.items.map((i: { id: string }) => i.id);
    for (const i of page2.body.items) expect(ids1).not.toContain(i.id);
    for (const i of [...page1.body.items, ...page2.body.items]) expect(i.kind).toBe('SERVICE');
  });

  it('updates use optimistic concurrency via If-Match', async () => {
    const owner = await as(t, 'northwind', 'owner', 'NWC');
    const created = await owner.post('/items', {
      kind: 'SERVICE',
      code: 'TRAINING-DAY',
      name: { en: 'Training day' },
      baseUomCode: 'DAY',
    });
    const stale = await owner.patch(
      `/items/${created.body.id}`,
      { description: 'stale' },
      { 'if-match': '"version-99"' },
    );
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('VERSION_CONFLICT');
    expect(stale.body.conflictVersion).toBe(1);
    const fresh = await owner.patch(
      `/items/${created.body.id}`,
      { description: 'Full-day onsite training' },
      { 'if-match': '"version-1"' },
    );
    expect(fresh.status).toBe(200);
    expect(fresh.body.version).toBe(2);
    expect(fresh.body.description).toBe('Full-day onsite training');
  });

  it('the database CHECK constraints reject an impossible item even when application code is bypassed', async () => {
    const uom = await t.admin.query('SELECT id FROM uoms WHERE tenant_id = $1 LIMIT 1', [
      t.data.northwind.id,
    ]);
    await expect(
      t.admin.query(
        `INSERT INTO items (id, tenant_id, kind, code, code_normalized, name, base_uom_id, track_inventory) VALUES (gen_random_uuid(), $1, 'SERVICE', 'X', 'X', '{"en":"x"}', $2, true)`,
        [t.data.northwind.id, uom.rows[0].id],
      ),
    ).rejects.toThrow(/items_intangible_no_tracking_ck/);
    const svc = await t.admin.query(
      `SELECT id FROM items WHERE tenant_id = $1 AND kind = 'SERVICE' LIMIT 1`,
      [t.data.northwind.id],
    );
    await expect(
      t.admin.query(
        `INSERT INTO item_barcodes (id, tenant_id, item_id, value) VALUES (gen_random_uuid(), $1, $2, '123')`,
        [t.data.northwind.id, svc.rows[0].id],
      ),
    ).rejects.toThrow(/cannot have physical attributes/);
  });

  it('MI-024: no regulated clinical/patient data model exists in the schema', async () => {
    const cols = await t.admin.query(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND (column_name ~* 'patient|diagnos|clinical|medical_record' OR table_name ~* 'patient|diagnos|clinical')`,
    );
    expect(cols.rows).toEqual([]);
  });
});
