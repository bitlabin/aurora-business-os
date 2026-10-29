import { describe, expect, it } from 'vitest';
import { CORE_MODULES, MODULES, MODULE_META, isCoreModule } from '../src/modules';
import {
  PERMISSION_DEFS,
  PERMISSIONS,
  ROLE_TEMPLATES,
  isPermissionKey,
  permissionModule,
} from '../src/permissions';
import { newId, isUuid, asId } from '../src/ids';

describe('permission catalog', () => {
  it('has unique, well-formed keys of the form module.resource.action', () => {
    const keys = PERMISSION_DEFS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z_]+\.[a-z_]+\.[a-z_]+$/);
  });

  it('role templates only reference known permissions', () => {
    for (const role of ROLE_TEMPLATES) {
      for (const p of role.permissions) expect(isPermissionKey(p), `${role.key}:${p}`).toBe(true);
    }
  });

  it('the auditor role is read-only', () => {
    const auditor = ROLE_TEMPLATES.find((r) => r.key === 'auditor')!;
    for (const p of auditor.permissions) expect(p.endsWith('.read')).toBe(true);
  });

  it('maps every permission to a known module', () => {
    for (const p of PERMISSIONS) expect(MODULES).toContain(permissionModule(p));
  });
});

describe('module catalog', () => {
  it('core modules are a subset with metadata for every module', () => {
    for (const m of CORE_MODULES) expect(isCoreModule(m)).toBe(true);
    expect(isCoreModule('inventory')).toBe(false);
    for (const m of MODULES) expect(MODULE_META[m].label.ar.length).toBeGreaterThan(0);
  });
});

describe('ids', () => {
  it('generates time-ordered v7 UUIDs', () => {
    const a = newId();
    const b = newId();
    expect(isUuid(a)).toBe(true);
    expect(a < b || a === b).toBe(true);
    expect(() => asId('nope')).toThrow(TypeError);
  });
});
