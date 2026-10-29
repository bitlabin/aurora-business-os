import { describe, expect, it } from 'vitest';
import { CORE_MODULES, type ModuleKey, type PermissionKey } from '@aurora/types';
import { buildNavigation, buildQuickCreate } from './navigation';

const core = new Set<ModuleKey>(CORE_MODULES);

describe('navigation derivation (F-UX-001)', () => {
  it('hides optional module sections when the module is disabled, even with the permission', () => {
    const perms = new Set<PermissionKey>(['inventory.warehouse.read', 'crm.party.read']);
    expect(buildNavigation(core, perms).map((n) => n.key)).toEqual(['home', 'crm.parties']);
    expect(buildNavigation(new Set([...core, 'inventory']), perms).map((n) => n.key)).toEqual([
      'home',
      'crm.parties',
      'inventory.warehouses',
    ]);
  });

  it('hides sections the user has no permission for', () => {
    expect(buildNavigation(new Set([...core, 'inventory']), new Set()).map((n) => n.key)).toEqual([
      'home',
    ]);
  });

  it('quick-create offers only actions the user can perform', () => {
    expect(buildQuickCreate(core, new Set(['catalog.item.create'])).map((q) => q.key)).toEqual([
      'item',
    ]);
  });
});
