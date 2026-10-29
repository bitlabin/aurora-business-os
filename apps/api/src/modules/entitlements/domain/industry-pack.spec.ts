import { describe, expect, it } from 'vitest';
import { CORE_MODULES, isModuleKey, isPermissionKey } from '@aurora/types';
import { diffPack } from './industry-pack';
import { INDUSTRY_PACKS, findPack } from './packs';

describe('industry pack manifests', () => {
  it('reference only known optional modules and permissions', () => {
    for (const pack of INDUSTRY_PACKS) {
      for (const m of pack.modules) {
        expect(isModuleKey(m)).toBe(true);
        expect(CORE_MODULES).not.toContain(m);
      }
      for (const role of pack.roles)
        for (const p of role.permissions) expect(isPermissionKey(p)).toBe(true);
      expect(pack.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('roadmap packs are listed but not installable (F-PACK-10)', () => {
    expect(findPack('nonprofit')?.installable).toBe(false);
    const diff = diffPack(findPack('nonprofit')!, {
      enabledModules: new Set(),
      existingRoleKeys: new Set(),
      existingCategoryCodes: new Set(),
      installedVersion: null,
    });
    expect(diff.conflicts.map((c) => c.kind)).toContain('not_installable');
  });
});

describe('diffPack', () => {
  it('reports only the delta and never lists posted/operational tables', () => {
    const diff = diffPack(findPack('distribution')!, {
      enabledModules: new Set(['inventory']),
      existingRoleKeys: new Set(),
      existingCategoryCodes: new Set(['TRADE_GOODS']),
      installedVersion: null,
    });
    expect(diff.modulesToEnable).toEqual(['warehouse', 'purchasing']);
    expect(diff.modulesAlreadyEnabled).toEqual(['inventory']);
    expect(diff.itemCategoriesToCreate).toEqual(['PACKAGING']);
    expect(diff.itemCategoriesExisting).toEqual(['TRADE_GOODS']);
    expect(diff.conflicts).toEqual([]);
    for (const t of diff.touches)
      expect(['items', 'parties', 'journal_lines', 'stock_movements']).not.toContain(t);
  });

  it('flags re-installing the same version', () => {
    const diff = diffPack(findPack('general-business')!, {
      enabledModules: new Set(),
      existingRoleKeys: new Set(),
      existingCategoryCodes: new Set(['SERVICES', 'FEES']),
      installedVersion: '1.0.0',
    });
    expect(diff.conflicts.map((c) => c.kind)).toEqual(['already_installed']);
    expect(diff.touches).not.toContain('item_categories');
  });
});
