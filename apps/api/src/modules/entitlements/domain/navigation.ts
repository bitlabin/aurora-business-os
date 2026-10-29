import { type ModuleKey, type NavigationItem, type PermissionKey } from '@aurora/types';

/**
 * Navigation is derived (F-UX-001, FDD §2.2): a section appears only when its module is enabled
 * AND the user holds at least one of its permissions. Nothing here is a placeholder — every
 * entry below maps to a route that exists in Phase 0. Later phases append entries as they ship.
 */
interface NavSpec {
  key: string;
  module: ModuleKey;
  label: { en: string; ar: string };
  href: string;
  anyOf: PermissionKey[];
  order: number;
}

const NAV_SPECS: readonly NavSpec[] = [
  {
    key: 'home',
    module: 'crm',
    label: { en: 'Home', ar: 'الرئيسية' },
    href: '/home',
    anyOf: [],
    order: 0,
  },
  {
    key: 'crm.parties',
    module: 'crm',
    label: { en: 'Parties', ar: 'الأطراف' },
    href: '/crm/parties',
    anyOf: ['crm.party.read'],
    order: 10,
  },
  {
    key: 'catalog.items',
    module: 'sales',
    label: { en: 'Items & Services', ar: 'الأصناف والخدمات' },
    href: '/catalog/items',
    anyOf: ['catalog.item.read'],
    order: 20,
  },
  {
    key: 'inventory.warehouses',
    module: 'inventory',
    label: { en: 'Warehouses', ar: 'المستودعات' },
    href: '/inventory/warehouses',
    anyOf: ['inventory.warehouse.read'],
    order: 40,
  },
  {
    key: 'admin.companies',
    module: 'crm',
    label: { en: 'Companies', ar: 'الشركات' },
    href: '/admin/companies',
    anyOf: ['admin.company.read'],
    order: 200,
  },
  {
    key: 'admin.members',
    module: 'crm',
    label: { en: 'Users & Roles', ar: 'المستخدمون والأدوار' },
    href: '/admin/members',
    anyOf: ['admin.user.read', 'admin.role.read'],
    order: 210,
  },
  {
    key: 'admin.modules',
    module: 'crm',
    label: { en: 'Modules & Industry Packs', ar: 'الوحدات وحزم القطاعات' },
    href: '/admin/modules',
    anyOf: ['admin.entitlement.read', 'admin.industry_pack.read'],
    order: 220,
  },
  {
    key: 'admin.audit',
    module: 'crm',
    label: { en: 'Audit Log', ar: 'سجل التدقيق' },
    href: '/admin/audit',
    anyOf: ['admin.audit.read'],
    order: 230,
  },
];

interface QuickCreateSpec {
  key: string;
  module: ModuleKey;
  label: { en: string; ar: string };
  href: string;
  permission: PermissionKey;
}

const QUICK_CREATE: readonly QuickCreateSpec[] = [
  {
    key: 'party',
    module: 'crm',
    label: { en: 'Party', ar: 'طرف' },
    href: '/crm/parties/new',
    permission: 'crm.party.create',
  },
  {
    key: 'item',
    module: 'sales',
    label: { en: 'Item or service', ar: 'صنف أو خدمة' },
    href: '/catalog/items/new',
    permission: 'catalog.item.create',
  },
];

export function buildNavigation(
  modules: ReadonlySet<ModuleKey>,
  permissions: ReadonlySet<PermissionKey>,
): NavigationItem[] {
  return NAV_SPECS.filter(
    (n) =>
      modules.has(n.module) && (n.anyOf.length === 0 || n.anyOf.some((p) => permissions.has(p))),
  )
    .map((n) => ({ key: n.key, module: n.module, label: n.label, href: n.href, order: n.order }))
    .sort((a, b) => a.order - b.order);
}

export function buildQuickCreate(
  modules: ReadonlySet<ModuleKey>,
  permissions: ReadonlySet<PermissionKey>,
) {
  return QUICK_CREATE.filter((q) => modules.has(q.module) && permissions.has(q.permission)).map(
    (q) => ({ key: q.key, label: q.label, href: q.href }),
  );
}
