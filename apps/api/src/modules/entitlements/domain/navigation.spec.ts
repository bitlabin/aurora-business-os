import { describe, expect, it } from 'vitest';
import { CORE_MODULES, type ModuleKey, type PermissionKey } from '@aurora/types';
import { NAV_SPECS, buildNavigation, buildQuickCreate } from './navigation';

const core = new Set<ModuleKey>(CORE_MODULES);
const withInventory = new Set<ModuleKey>([...CORE_MODULES, 'inventory']);

describe('navigation derivation (F-UX-001)', () => {
  it('hides optional module sections when the module is disabled, even with the permission', () => {
    const perms = new Set<PermissionKey>(['inventory.warehouse.read', 'crm.party.read']);
    expect(buildNavigation(core, perms).map((n) => n.key)).not.toContain('products.warehouses');
    expect(buildNavigation(withInventory, perms).map((n) => n.key)).toContain(
      'products.warehouses',
    );
  });

  it('hides sections the user has no permission for, and groups with no visible child', () => {
    const keys = buildNavigation(withInventory, new Set()).map((n) => n.key);
    expect(keys).toContain('home');
    expect(keys).not.toContain('customers');
    expect(keys).not.toContain('settings');
  });

  it('keeps the product-wide order: Home … Settings', () => {
    const all = new Set<PermissionKey>([
      'crm.party.read',
      'catalog.item.read',
      'inventory.warehouse.read',
      'admin.company.read',
    ]);
    const top = buildNavigation(withInventory, all)
      .filter((n) => n.parentKey === null)
      .map((n) => n.key);
    expect(top).toEqual([
      'home',
      'products',
      'customers',
      'suppliers',
      'invoices',
      'orders',
      'payments',
      'expenses',
      'accounting',
      'settings',
    ]);
  });

  it('available entries link to a route; planned entries never do and carry their phase', () => {
    const nav = buildNavigation(withInventory, new Set(['crm.party.read', 'catalog.item.read']));
    for (const n of nav) {
      if (n.status === 'available') {
        expect(n.href).toMatch(/^\//);
        expect(n.phase).toBeNull();
      } else {
        expect(n.href).toBeNull();
        expect(n.phase).toBeGreaterThanOrEqual(1);
      }
    }
    expect(nav.find((n) => n.key === 'invoices')?.status).toBe('planned');
    expect(nav.find((n) => n.key === 'accounting')?.phase).toBe(1);
    expect(nav.find((n) => n.key === 'products')?.href).toBe('/catalog/items');
  });

  it('a group links to its first available child', () => {
    const nav = buildNavigation(core, new Set(['admin.audit.read']));
    expect(nav.find((n) => n.key === 'settings')?.href).toBe('/admin/audit');
    expect(nav.filter((n) => n.parentKey === 'settings').map((n) => n.key)).toEqual([
      'settings.audit',
    ]);
  });

  it('every spec either has an href (available) or a phase (planned), never both', () => {
    for (const spec of NAV_SPECS) {
      const isGroup = NAV_SPECS.some((n) => n.parentKey === spec.key);
      if (isGroup) continue;
      expect(Boolean(spec.href) !== Boolean(spec.phase)).toBe(true);
    }
  });

  it('quick-create offers only actions the user can perform', () => {
    expect(buildQuickCreate(core, new Set(['catalog.item.create'])).map((q) => q.key)).toEqual([
      'item',
    ]);
  });
});
