import { describe, expect, it } from 'vitest';
import { ITEM_KINDS, ITEM_KIND_POLICIES, resolveItemCapabilities } from '../src/item-kinds';
import { createItemRequestSchema } from '../src/schemas/items';

describe('item kind policies (ADR-005, F-ITEM-002)', () => {
  it('every kind has a policy whose defaults respect its allowed set', () => {
    for (const kind of ITEM_KINDS) {
      const policy = ITEM_KIND_POLICIES[kind];
      for (const [cap, value] of Object.entries(policy.defaults)) {
        if (value) expect(policy.allowed, `${kind}.${cap}`).toContain(cap);
      }
    }
  });

  it('a SERVICE cannot track inventory, lots, serials, expiry or location', () => {
    const { violations } = resolveItemCapabilities('SERVICE', {
      track_inventory: true,
      track_lot: true,
      track_expiry: true,
    });
    expect(violations.map((v) => v.capability)).toEqual(
      expect.arrayContaining(['track_inventory', 'track_lot', 'track_expiry']),
    );
  });

  it('a STOCKED_GOOD without lot/expiry is valid (MI-009: tracking is per item, not global)', () => {
    const { capabilities, violations } = resolveItemCapabilities('STOCKED_GOOD', {
      track_serial: true,
    });
    expect(violations).toEqual([]);
    expect(capabilities.track_inventory).toBe(true);
    expect(capabilities.track_serial).toBe(true);
    expect(capabilities.track_expiry).toBe(false);
    expect(capabilities.track_lot).toBe(false);
  });

  it('expiry requires lot, and lot excludes serial', () => {
    expect(
      resolveItemCapabilities('STOCKED_GOOD', { track_expiry: true }).violations[0]?.reason,
    ).toMatch(/expiry tracking requires lot/);
    expect(
      resolveItemCapabilities('STOCKED_GOOD', { track_lot: true, track_serial: true }).violations[0]
        ?.reason,
    ).toMatch(/either lot-tracked or serial-tracked/);
  });

  it('a rental asset may be serial-tracked without a stock ledger', () => {
    const { capabilities, violations } = resolveItemCapabilities('RENTAL_ASSET');
    expect(violations).toEqual([]);
    expect(capabilities.track_serial).toBe(true);
    expect(capabilities.track_inventory).toBe(false);
    expect(capabilities.is_sellable).toBe(false);
  });
});

describe('createItemRequestSchema', () => {
  it('accepts a service with no physical attributes at all (MI-001)', () => {
    const result = createItemRequestSchema.safeParse({
      kind: 'SERVICE',
      code: 'CONSULT-HR',
      name: { en: 'Consulting hour' },
      baseUomCode: 'HOUR',
    });
    expect(result.success).toBe(true);
  });

  it('rejects physical attributes on a service at the schema boundary', () => {
    const result = createItemRequestSchema.safeParse({
      kind: 'SERVICE',
      code: 'CONSULT-HR',
      name: { en: 'Consulting hour' },
      baseUomCode: 'HOUR',
      physical: { barcodes: [{ value: '0012345' }] },
    });
    expect(result.success).toBe(false);
  });

  it('preserves leading zeros in barcodes (T-022)', () => {
    const result = createItemRequestSchema.safeParse({
      kind: 'STOCKED_GOOD',
      code: 'SKU-1',
      name: { en: 'Widget', ar: 'قطعة' },
      baseUomCode: 'EA',
      physical: { barcodes: [{ value: '0012345', symbology: 'OTHER', isPrimary: true }] },
    });
    expect(result.success).toBe(true);
    const data = result.success && result.data.kind === 'STOCKED_GOOD' ? result.data : undefined;
    expect(data?.physical?.barcodes[0]?.value).toBe('0012345');
  });
});
