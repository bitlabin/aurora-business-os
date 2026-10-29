import { describe, expect, it } from 'vitest';
import { AppError, CORE_MODULES, type ModuleKey } from '@aurora/types';
import { normalizeCode, validateItemCapabilities } from './item';

const core = new Set<ModuleKey>(CORE_MODULES);
const withInventory = new Set<ModuleKey>([...CORE_MODULES, 'inventory']);

describe('validateItemCapabilities', () => {
  it('a service in a service-only company needs nothing physical (MI-001)', () => {
    const caps = validateItemCapabilities('SERVICE', {}, core);
    expect(caps.track_inventory).toBe(false);
    expect(caps.is_billable).toBe(true);
  });

  it('a stocked good requires the inventory module (CORE-IND-002)', () => {
    expect(() => validateItemCapabilities('STOCKED_GOOD', {}, core)).toThrow(AppError);
    expect(validateItemCapabilities('STOCKED_GOOD', {}, withInventory).track_inventory).toBe(true);
  });

  it('a nonstock good never needs inventory (MI-022)', () => {
    expect(validateItemCapabilities('NONSTOCK_GOOD', {}, core).track_inventory).toBe(false);
  });

  it('reports every violation with a field path', () => {
    try {
      validateItemCapabilities('SERVICE', { track_lot: true, track_expiry: true }, core);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).fieldErrors?.map((f) => f.path)).toEqual(
        expect.arrayContaining(['capabilities.track_lot', 'capabilities.track_expiry']),
      );
    }
  });

  it('normalizes codes case-insensitively while preserving leading zeros', () => {
    expect(normalizeCode(' sku-0012 ')).toBe('SKU-0012');
  });
});
