/**
 * Capability modules (ADR-004, CORE-IND-002). Core modules are always enabled; optional
 * modules are switched per tenant (`module_entitlements`) and narrowed per legal entity
 * (`entity_capabilities`).
 */
export const MODULES = [
  'crm',
  'sales',
  'accounting',
  'documents',
  'analytics',
  'purchasing',
  'inventory',
  'warehouse',
  'pos',
  'projects',
  'manufacturing',
  'field_service',
  'rentals',
  'subscriptions',
  'service_desk',
  'automation',
] as const;

export type ModuleKey = (typeof MODULES)[number];

export const CORE_MODULES = [
  'crm',
  'sales',
  'accounting',
  'documents',
  'analytics',
] as const satisfies readonly ModuleKey[];

export type CoreModuleKey = (typeof CORE_MODULES)[number];
export type OptionalModuleKey = Exclude<ModuleKey, CoreModuleKey>;

export function isCoreModule(module: ModuleKey): module is CoreModuleKey {
  return (CORE_MODULES as readonly string[]).includes(module);
}

export function isModuleKey(value: unknown): value is ModuleKey {
  return typeof value === 'string' && (MODULES as readonly string[]).includes(value);
}

/** Human-readable metadata used by navigation and the admin UI. Not a source of authority. */
export const MODULE_META: Record<ModuleKey, { label: { en: string; ar: string }; order: number }> =
  {
    crm: { label: { en: 'CRM', ar: 'إدارة العملاء' }, order: 10 },
    sales: { label: { en: 'Sales', ar: 'المبيعات' }, order: 20 },
    purchasing: { label: { en: 'Purchases', ar: 'المشتريات' }, order: 30 },
    inventory: { label: { en: 'Inventory', ar: 'المخزون' }, order: 40 },
    warehouse: { label: { en: 'Warehouse', ar: 'المستودع' }, order: 50 },
    pos: { label: { en: 'Retail POS', ar: 'نقاط البيع' }, order: 55 },
    projects: { label: { en: 'Projects', ar: 'المشاريع' }, order: 60 },
    manufacturing: { label: { en: 'Manufacturing', ar: 'التصنيع' }, order: 65 },
    field_service: { label: { en: 'Field Service', ar: 'الخدمة الميدانية' }, order: 70 },
    rentals: { label: { en: 'Rentals', ar: 'التأجير' }, order: 75 },
    subscriptions: { label: { en: 'Subscriptions', ar: 'الاشتراكات' }, order: 80 },
    accounting: { label: { en: 'Books', ar: 'الحسابات' }, order: 90 },
    service_desk: { label: { en: 'Support', ar: 'الدعم' }, order: 100 },
    analytics: { label: { en: 'Reports', ar: 'التقارير' }, order: 110 },
    automation: { label: { en: 'Automation', ar: 'الأتمتة' }, order: 120 },
    documents: { label: { en: 'Documents', ar: 'المستندات' }, order: 130 },
  };
