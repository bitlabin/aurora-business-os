import type { ModuleKey } from './modules';

/**
 * Permission catalog (ADR-003, SEC-002). Format: `module.resource.action`.
 * Only strings in this list can be granted; roles reference them by value.
 * Each permission names the module it belongs to so navigation and guards agree.
 */
export const PERMISSION_DEFS = [
  // identity / administration
  { key: 'admin.tenant.read', module: 'crm', sensitive: false },
  { key: 'admin.tenant.manage', module: 'crm', sensitive: true },
  { key: 'admin.company.read', module: 'crm', sensitive: false },
  { key: 'admin.company.manage', module: 'crm', sensitive: true },
  { key: 'admin.user.read', module: 'crm', sensitive: false },
  { key: 'admin.user.manage', module: 'crm', sensitive: true },
  { key: 'admin.role.read', module: 'crm', sensitive: false },
  { key: 'admin.role.manage', module: 'crm', sensitive: true },
  { key: 'admin.entitlement.read', module: 'crm', sensitive: false },
  { key: 'admin.entitlement.manage', module: 'crm', sensitive: true },
  { key: 'admin.industry_pack.read', module: 'crm', sensitive: false },
  { key: 'admin.industry_pack.install', module: 'crm', sensitive: true },
  { key: 'admin.audit.read', module: 'crm', sensitive: true },
  // crm
  { key: 'crm.party.read', module: 'crm', sensitive: false },
  { key: 'crm.party.create', module: 'crm', sensitive: false },
  { key: 'crm.party.update', module: 'crm', sensitive: false },
  { key: 'crm.party.archive', module: 'crm', sensitive: false },
  { key: 'crm.party.export', module: 'crm', sensitive: true },
  // catalog (shared by sales/purchasing)
  { key: 'catalog.item.read', module: 'sales', sensitive: false },
  { key: 'catalog.item.create', module: 'sales', sensitive: false },
  { key: 'catalog.item.update', module: 'sales', sensitive: false },
  { key: 'catalog.item.archive', module: 'sales', sensitive: false },
  { key: 'catalog.category.manage', module: 'sales', sensitive: false },
  // inventory (optional module; endpoints exist only to prove entitlement gating in Phase 0)
  { key: 'inventory.warehouse.read', module: 'inventory', sensitive: false },
  { key: 'inventory.warehouse.manage', module: 'inventory', sensitive: false },
] as const;

export type PermissionKey = (typeof PERMISSION_DEFS)[number]['key'];

export const PERMISSIONS: readonly PermissionKey[] = PERMISSION_DEFS.map((p) => p.key);

export function isPermissionKey(value: unknown): value is PermissionKey {
  return typeof value === 'string' && (PERMISSIONS as readonly string[]).includes(value);
}

export function permissionModule(key: PermissionKey): ModuleKey {
  const def = PERMISSION_DEFS.find((p) => p.key === key);
  if (def === undefined) {
    // Unreachable: PERMISSION_DEFS is exhaustive over PermissionKey by construction.
    throw new Error(`Unknown permission ${key}`);
  }
  return def.module;
}

/**
 * Baseline role templates (FDD §20). Tenants receive copies they may edit; the templates
 * themselves are code and therefore reviewable.
 */
export const ROLE_TEMPLATES: readonly {
  key: string;
  name: { en: string; ar: string };
  permissions: readonly PermissionKey[];
}[] = [
  {
    key: 'owner',
    name: { en: 'Owner / CEO', ar: 'المالك' },
    permissions: PERMISSIONS,
  },
  {
    key: 'entity_admin',
    name: { en: 'Entity Administrator', ar: 'مدير الكيان' },
    permissions: [
      'admin.tenant.read',
      'admin.company.read',
      'admin.company.manage',
      'admin.user.read',
      'admin.user.manage',
      'admin.role.read',
      'admin.entitlement.read',
      'admin.industry_pack.read',
      'admin.audit.read',
      'crm.party.read',
      'crm.party.create',
      'crm.party.update',
      'crm.party.archive',
      'catalog.item.read',
      'catalog.item.create',
      'catalog.item.update',
      'catalog.item.archive',
      'catalog.category.manage',
      'inventory.warehouse.read',
      'inventory.warehouse.manage',
    ],
  },
  {
    key: 'sales_manager',
    name: { en: 'Sales Manager', ar: 'مدير المبيعات' },
    permissions: [
      'crm.party.read',
      'crm.party.create',
      'crm.party.update',
      'crm.party.export',
      'catalog.item.read',
    ],
  },
  {
    key: 'sales_rep',
    name: { en: 'Sales Representative', ar: 'مندوب مبيعات' },
    permissions: ['crm.party.read', 'crm.party.create', 'crm.party.update', 'catalog.item.read'],
  },
  {
    key: 'accountant',
    name: { en: 'Accountant', ar: 'محاسب' },
    permissions: ['crm.party.read', 'catalog.item.read', 'admin.company.read'],
  },
  {
    key: 'inventory_controller',
    name: { en: 'Inventory Controller', ar: 'مراقب المخزون' },
    permissions: [
      'catalog.item.read',
      'catalog.item.create',
      'catalog.item.update',
      'inventory.warehouse.read',
      'inventory.warehouse.manage',
    ],
  },
  {
    key: 'auditor',
    name: { en: 'Auditor (read-only)', ar: 'مدقق (قراءة فقط)' },
    permissions: [
      'admin.tenant.read',
      'admin.company.read',
      'admin.user.read',
      'admin.role.read',
      'admin.entitlement.read',
      'admin.industry_pack.read',
      'admin.audit.read',
      'crm.party.read',
      'catalog.item.read',
      'inventory.warehouse.read',
    ],
  },
];
