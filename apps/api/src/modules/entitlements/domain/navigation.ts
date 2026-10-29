import {
  type ModuleKey,
  type NavIcon,
  type NavigationItem,
  type PermissionKey,
} from '@aurora/types';

/**
 * Navigation is derived (F-UX-001, FDD §2.2). The sidebar follows one product-wide information
 * architecture — Home, Products, Customers, Suppliers, Invoices, Orders, Payments, Expenses,
 * Accounting, Settings — so every business sees the same map, and modules light up in place as
 * they ship and as the tenant enables them.
 *
 * Two kinds of entry:
 *  - `available`: the route exists in this build. Shown only when the module is enabled AND the
 *    user holds at least one of its permissions. Never a placeholder.
 *  - `planned`: the route does not exist yet. Shown disabled with its phase so the map is honest
 *    about what is coming (FDD §26.3 forbids anything that looks finished but is not). A planned
 *    entry is hidden when the tenant has explicitly disabled its module.
 *
 * A group (top-level entry with children) is shown when at least one child is shown; its link is
 * its first available child.
 */
interface NavSpec {
  key: string;
  parentKey?: string;
  module: ModuleKey;
  label: { en: string; ar: string };
  icon?: NavIcon;
  /** Omitted for planned entries. */
  href?: string;
  phase?: number;
  anyOf: PermissionKey[];
  order: number;
}

const ANY_ADMIN: PermissionKey[] = [
  'admin.company.read',
  'admin.user.read',
  'admin.role.read',
  'admin.entitlement.read',
  'admin.industry_pack.read',
  'admin.audit.read',
];

export const NAV_SPECS: readonly NavSpec[] = [
  // ------------------------------------------------------------------ Home
  {
    key: 'home',
    module: 'crm',
    label: { en: 'Home', ar: 'الرئيسية' },
    icon: 'home',
    href: '/home',
    anyOf: [],
    order: 0,
  },

  // ------------------------------------------------------------------ Products (inventory)
  {
    key: 'products',
    module: 'sales',
    label: { en: 'Products', ar: 'المنتجات' },
    icon: 'products',
    anyOf: ['catalog.item.read', 'inventory.warehouse.read'],
    order: 100,
  },
  {
    key: 'products.items',
    parentKey: 'products',
    module: 'sales',
    label: { en: 'Items & services', ar: 'الأصناف والخدمات' },
    href: '/catalog/items',
    anyOf: ['catalog.item.read'],
    order: 110,
  },
  {
    key: 'products.warehouses',
    parentKey: 'products',
    module: 'inventory',
    label: { en: 'Warehouses', ar: 'المستودعات' },
    href: '/inventory/warehouses',
    anyOf: ['inventory.warehouse.read'],
    order: 120,
  },
  {
    key: 'products.stock',
    parentKey: 'products',
    module: 'inventory',
    label: { en: 'Stock levels', ar: 'مستويات المخزون' },
    phase: 2,
    anyOf: ['inventory.warehouse.read'],
    order: 130,
  },

  // ------------------------------------------------------------------ Customers
  {
    key: 'customers',
    module: 'crm',
    label: { en: 'Customers', ar: 'العملاء' },
    icon: 'customers',
    anyOf: ['crm.party.read'],
    order: 200,
  },
  {
    key: 'customers.all',
    parentKey: 'customers',
    module: 'crm',
    label: { en: 'Customers', ar: 'العملاء' },
    href: '/crm/parties?role=CUSTOMER',
    anyOf: ['crm.party.read'],
    order: 210,
  },
  {
    key: 'customers.prospects',
    parentKey: 'customers',
    module: 'crm',
    label: { en: 'Prospects', ar: 'العملاء المحتملون' },
    href: '/crm/parties?role=PROSPECT',
    anyOf: ['crm.party.read'],
    order: 220,
  },
  {
    key: 'customers.parties',
    parentKey: 'customers',
    module: 'crm',
    label: { en: 'All parties', ar: 'كل الأطراف' },
    href: '/crm/parties',
    anyOf: ['crm.party.read'],
    order: 230,
  },

  // ------------------------------------------------------------------ Suppliers
  {
    key: 'suppliers',
    module: 'crm',
    label: { en: 'Suppliers', ar: 'الموردون' },
    icon: 'suppliers',
    anyOf: ['crm.party.read'],
    order: 300,
  },
  {
    key: 'suppliers.all',
    parentKey: 'suppliers',
    module: 'crm',
    label: { en: 'Suppliers', ar: 'الموردون' },
    href: '/crm/parties?role=SUPPLIER',
    anyOf: ['crm.party.read'],
    order: 310,
  },
  {
    key: 'suppliers.purchase_orders',
    parentKey: 'suppliers',
    module: 'purchasing',
    label: { en: 'Purchase orders', ar: 'أوامر الشراء' },
    phase: 2,
    anyOf: [],
    order: 320,
  },

  // ------------------------------------------------------------------ Invoices (Phase 1)
  {
    key: 'invoices',
    module: 'sales',
    label: { en: 'Invoices', ar: 'الفواتير' },
    icon: 'invoices',
    phase: 1,
    anyOf: [],
    order: 400,
  },

  // ------------------------------------------------------------------ Orders (Phase 1)
  {
    key: 'orders',
    module: 'sales',
    label: { en: 'Orders', ar: 'الطلبات' },
    icon: 'orders',
    anyOf: [],
    order: 500,
  },
  {
    key: 'orders.sales_orders',
    parentKey: 'orders',
    module: 'sales',
    label: { en: 'Sales orders', ar: 'أوامر البيع' },
    phase: 1,
    anyOf: [],
    order: 510,
  },
  {
    key: 'orders.quotes',
    parentKey: 'orders',
    module: 'sales',
    label: { en: 'Quotes', ar: 'عروض الأسعار' },
    phase: 1,
    anyOf: [],
    order: 520,
  },

  // ------------------------------------------------------------------ Payments (Phase 1)
  {
    key: 'payments',
    module: 'accounting',
    label: { en: 'Payments', ar: 'المدفوعات' },
    icon: 'payments',
    phase: 1,
    anyOf: [],
    order: 600,
  },

  // ------------------------------------------------------------------ Expenses (Phase 1)
  {
    key: 'expenses',
    module: 'accounting',
    label: { en: 'Expenses', ar: 'المصروفات' },
    icon: 'expenses',
    phase: 1,
    anyOf: [],
    order: 700,
  },

  // ------------------------------------------------------------------ Accounting (Phase 1)
  {
    key: 'accounting',
    module: 'accounting',
    label: { en: 'Accounting', ar: 'المحاسبة' },
    icon: 'accounting',
    anyOf: [],
    order: 800,
  },
  {
    key: 'accounting.chart_of_accounts',
    parentKey: 'accounting',
    module: 'accounting',
    label: { en: 'Chart of accounts', ar: 'دليل الحسابات' },
    phase: 1,
    anyOf: [],
    order: 810,
  },
  {
    key: 'accounting.journals',
    parentKey: 'accounting',
    module: 'accounting',
    label: { en: 'Journals', ar: 'القيود' },
    phase: 1,
    anyOf: [],
    order: 820,
  },
  {
    key: 'accounting.reports',
    parentKey: 'accounting',
    module: 'accounting',
    label: { en: 'Reports', ar: 'التقارير' },
    phase: 1,
    anyOf: [],
    order: 830,
  },

  // ------------------------------------------------------------------ Settings
  {
    key: 'settings',
    module: 'crm',
    label: { en: 'Settings', ar: 'الإعدادات' },
    icon: 'settings',
    anyOf: ANY_ADMIN,
    order: 900,
  },
  {
    key: 'settings.companies',
    parentKey: 'settings',
    module: 'crm',
    label: { en: 'Companies', ar: 'الشركات' },
    href: '/admin/companies',
    anyOf: ['admin.company.read'],
    order: 910,
  },
  {
    key: 'settings.members',
    parentKey: 'settings',
    module: 'crm',
    label: { en: 'Users & roles', ar: 'المستخدمون والأدوار' },
    href: '/admin/members',
    anyOf: ['admin.user.read', 'admin.role.read'],
    order: 920,
  },
  {
    key: 'settings.modules',
    parentKey: 'settings',
    module: 'crm',
    label: { en: 'Modules & industry packs', ar: 'الوحدات وحزم القطاعات' },
    href: '/admin/modules',
    anyOf: ['admin.entitlement.read', 'admin.industry_pack.read'],
    order: 930,
  },
  {
    key: 'settings.audit',
    parentKey: 'settings',
    module: 'crm',
    label: { en: 'Audit log', ar: 'سجل التدقيق' },
    href: '/admin/audit',
    anyOf: ['admin.audit.read'],
    order: 940,
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
    key: 'customer',
    module: 'crm',
    label: { en: 'Customer', ar: 'عميل' },
    href: '/crm/parties/new?role=CUSTOMER',
    permission: 'crm.party.create',
  },
  {
    key: 'supplier',
    module: 'crm',
    label: { en: 'Supplier', ar: 'مورد' },
    href: '/crm/parties/new?role=SUPPLIER',
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

function permitted(spec: NavSpec, permissions: ReadonlySet<PermissionKey>): boolean {
  return spec.anyOf.length === 0 || spec.anyOf.some((p) => permissions.has(p));
}

function toItem(spec: NavSpec, href: string | null): NavigationItem {
  return {
    key: spec.key,
    parentKey: spec.parentKey ?? null,
    module: spec.module,
    label: spec.label,
    icon: spec.icon ?? null,
    status: spec.href ? 'available' : 'planned',
    phase: spec.href ? null : (spec.phase ?? null),
    href,
    order: spec.order,
  };
}

export function buildNavigation(
  modules: ReadonlySet<ModuleKey>,
  permissions: ReadonlySet<PermissionKey>,
): NavigationItem[] {
  // A leaf is visible when its module is enabled and the user is permitted. Planned leaves are
  // informational: visible under the same module rule (so a tenant that switched a module off
  // does not see its roadmap either) and the same permission rule.
  const leaves = NAV_SPECS.filter(
    (n) => n.parentKey !== undefined && modules.has(n.module) && permitted(n, permissions),
  );
  const visibleParents = new Set(leaves.map((n) => n.parentKey));

  const items: NavigationItem[] = [];
  for (const spec of NAV_SPECS) {
    if (spec.parentKey !== undefined) continue;
    const children = leaves.filter((l) => l.parentKey === spec.key);
    const isGroup = NAV_SPECS.some((n) => n.parentKey === spec.key);
    if (isGroup) {
      if (!visibleParents.has(spec.key)) continue;
      // A group with only planned children is itself planned (no link, shows the earliest phase).
      const firstAvailable = children.find((c) => c.href);
      const phase = Math.min(...children.map((c) => c.phase ?? Number.POSITIVE_INFINITY));
      items.push(
        firstAvailable
          ? toItem({ ...spec, href: firstAvailable.href }, firstAvailable.href ?? null)
          : toItem({ ...spec, phase: Number.isFinite(phase) ? phase : undefined }, null),
      );
      for (const child of children) items.push(toItem(child, child.href ?? null));
      continue;
    }
    if (!modules.has(spec.module) || !permitted(spec, permissions)) continue;
    items.push(toItem(spec, spec.href ?? null));
  }
  return items.sort((a, b) => a.order - b.order);
}

export function buildQuickCreate(
  modules: ReadonlySet<ModuleKey>,
  permissions: ReadonlySet<PermissionKey>,
) {
  return QUICK_CREATE.filter((q) => modules.has(q.module) && permissions.has(q.permission)).map(
    (q) => ({ key: q.key, label: q.label, href: q.href }),
  );
}
