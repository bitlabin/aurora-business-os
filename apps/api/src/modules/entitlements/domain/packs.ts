import type { IndustryPackManifest } from './industry-pack';

/**
 * Built-in industry packs (F-PACK-01..10). Versions are bumped when a manifest changes so
 * installs are reproducible and upgrades are explicit. Roles reference only permissions that
 * exist in the catalog; module lists reference only optional modules. Roadmap packs are listed
 * with `installable: false` and carry no workflow claims.
 */
export const INDUSTRY_PACKS: readonly IndustryPackManifest[] = [
  {
    id: 'general-business',
    version: '1.0.0',
    name: { en: 'General business / corporate services', ar: 'أعمال عامة / خدمات مؤسسية' },
    description: {
      en: 'CRM, quotes, invoices, bills, expenses and full accounting with no inventory or warehouse.',
      ar: 'إدارة العملاء والعروض والفواتير والمصروفات والمحاسبة الكاملة بدون مخزون أو مستودع.',
    },
    installable: true,
    modules: [],
    roles: [],
    itemCategories: [
      { code: 'SERVICES', name: { en: 'Services', ar: 'خدمات' } },
      { code: 'FEES', name: { en: 'Fees', ar: 'رسوم' } },
    ],
    notes: [],
  },
  {
    id: 'professional-services',
    version: '1.0.0',
    name: { en: 'Professional services & agencies', ar: 'خدمات مهنية ووكالات' },
    description: {
      en: 'Engagements, timesheets, milestone and retainer billing on top of the general core.',
      ar: 'ارتباطات وجداول ساعات وفوترة بالمراحل أو بالعقد الشهري فوق النواة العامة.',
    },
    installable: true,
    modules: ['projects'],
    roles: [],
    itemCategories: [
      { code: 'CONSULTING', name: { en: 'Consulting', ar: 'استشارات' } },
      { code: 'RETAINERS', name: { en: 'Retainers', ar: 'عقود شهرية' } },
    ],
    notes: [
      {
        en: 'Project/time billing workflows ship in Phase 3; enabling the module now reserves navigation and permissions.',
        ar: 'تصل سير عمل المشاريع والفوترة بالوقت في المرحلة 3؛ تفعيل الوحدة الآن يحجز التنقل والصلاحيات.',
      },
    ],
  },
  {
    id: 'retail',
    version: '1.0.0',
    name: { en: 'Retail & omnichannel commerce', ar: 'تجزئة وتجارة متعددة القنوات' },
    description: {
      en: 'Stores, registers, POS sales and stocked products.',
      ar: 'متاجر وصناديق ونقاط بيع ومنتجات مخزنة.',
    },
    installable: true,
    modules: ['inventory', 'pos', 'purchasing'],
    roles: [],
    itemCategories: [
      { code: 'MERCHANDISE', name: { en: 'Merchandise', ar: 'بضائع' } },
      {
        code: 'GIFT_CARDS',
        name: { en: 'Gift cards & store credit', ar: 'بطاقات هدايا ورصيد متجر' },
      },
    ],
    notes: [
      {
        en: 'POS workflows ship in Phase 3; inventory in Phase 2.',
        ar: 'نقاط البيع في المرحلة 3؛ المخزون في المرحلة 2.',
      },
    ],
  },
  {
    id: 'distribution',
    version: '1.0.0',
    name: { en: 'Wholesale & distribution', ar: 'جملة وتوزيع' },
    description: {
      en: 'Multiple warehouses, purchasing, lot/expiry-capable items, pick/pack/ship and price books.',
      ar: 'مستودعات متعددة ومشتريات وأصناف بدفعات وصلاحية وتجهيز وشحن وقوائم أسعار.',
    },
    installable: true,
    modules: ['inventory', 'warehouse', 'purchasing'],
    roles: [],
    itemCategories: [
      { code: 'TRADE_GOODS', name: { en: 'Trade goods', ar: 'بضائع تجارية' } },
      { code: 'PACKAGING', name: { en: 'Packaging', ar: 'تغليف' } },
    ],
    notes: [
      {
        en: 'Valuation method (FIFO vs weighted average) requires controller sign-off before stock cutover.',
        ar: 'طريقة التقييم تتطلب اعتماد المراقب المالي قبل نقل المخزون.',
      },
    ],
  },
  {
    id: 'construction',
    version: '1.0.0',
    name: { en: 'Construction & contracting', ar: 'إنشاءات ومقاولات' },
    description: {
      en: 'Jobs, cost codes, commitments, progress claims and retention.',
      ar: 'مشاريع ورموز تكلفة والتزامات ومطالبات مرحلية ومحتجزات.',
    },
    installable: true,
    modules: ['projects', 'purchasing'],
    roles: [],
    itemCategories: [
      { code: 'LABOR', name: { en: 'Labor', ar: 'عمالة' } },
      { code: 'MATERIALS', name: { en: 'Materials', ar: 'مواد' } },
      { code: 'SUBCONTRACT', name: { en: 'Subcontract', ar: 'مقاولة من الباطن' } },
    ],
    notes: [
      {
        en: 'WIP and revenue recognition are gated on an approved accounting policy (CON-003).',
        ar: 'الأعمال تحت التنفيذ والاعتراف بالإيراد مرهونان بسياسة محاسبية معتمدة.',
      },
    ],
  },
  {
    id: 'manufacturing',
    version: '1.0.0',
    name: { en: 'Manufacturing & assembly', ar: 'تصنيع وتجميع' },
    description: {
      en: 'Bills of material, work orders, WIP and finished goods.',
      ar: 'قوائم مواد وأوامر عمل وأعمال تحت التنفيذ ومنتجات تامة.',
    },
    installable: true,
    modules: ['manufacturing', 'inventory', 'purchasing'],
    roles: [],
    itemCategories: [
      { code: 'RAW_MATERIALS', name: { en: 'Raw materials', ar: 'مواد خام' } },
      { code: 'FINISHED_GOODS', name: { en: 'Finished goods', ar: 'منتجات تامة' } },
    ],
    notes: [
      { en: 'Manufacturing workflows ship in Phase 4.', ar: 'سير عمل التصنيع في المرحلة 4.' },
    ],
  },
  {
    id: 'field-service',
    version: '1.0.0',
    name: { en: 'Field service & maintenance', ar: 'خدمة ميدانية وصيانة' },
    description: {
      en: 'Work orders, technicians, customer assets and service contracts.',
      ar: 'أوامر عمل وفنيون وأصول عملاء وعقود خدمة.',
    },
    installable: true,
    modules: ['field_service', 'service_desk'],
    roles: [],
    itemCategories: [
      { code: 'SERVICE_LABOR', name: { en: 'Service labor', ar: 'عمالة خدمة' } },
      { code: 'SPARE_PARTS', name: { en: 'Spare parts', ar: 'قطع غيار' } },
    ],
    notes: [
      {
        en: 'Field service workflows ship in Phase 4.',
        ar: 'سير عمل الخدمة الميدانية في المرحلة 4.',
      },
    ],
  },
  {
    id: 'rental',
    version: '1.0.0',
    name: { en: 'Rentals & equipment leasing', ar: 'تأجير معدات' },
    description: {
      en: 'Rental assets, reservations, deposits and recurring rental billing.',
      ar: 'أصول تأجير وحجوزات وودائع وفوترة دورية.',
    },
    installable: true,
    modules: ['rentals'],
    roles: [],
    itemCategories: [{ code: 'RENTAL_FLEET', name: { en: 'Rental fleet', ar: 'أسطول التأجير' } }],
    notes: [{ en: 'Rental workflows ship in Phase 4.', ar: 'سير عمل التأجير في المرحلة 4.' }],
  },
  {
    id: 'technology-digital',
    version: '1.0.0',
    name: { en: 'Technology, software & recurring services', ar: 'تقنية وبرمجيات وخدمات متكررة' },
    description: {
      en: 'Subscriptions, usage metering and deferred revenue.',
      ar: 'اشتراكات وقياس استخدام وإيراد مؤجل.',
    },
    installable: true,
    modules: ['subscriptions'],
    roles: [],
    itemCategories: [
      { code: 'PLANS', name: { en: 'Subscription plans', ar: 'خطط اشتراك' } },
      { code: 'LICENSES', name: { en: 'Licenses', ar: 'تراخيص' } },
    ],
    notes: [
      {
        en: 'Deferred revenue schedules require an approved finance policy (SUB-002).',
        ar: 'جداول الإيراد المؤجل تتطلب سياسة مالية معتمدة.',
      },
    ],
  },
  {
    id: 'nonprofit',
    version: '0.1.0',
    name: {
      en: 'Nonprofit / education / hospitality (roadmap)',
      ar: 'غير ربحي / تعليم / ضيافة (خارطة طريق)',
    },
    description: {
      en: 'Candidate pack. Not engineered: no donations, grants, memberships or sector-specific workflows exist yet.',
      ar: 'حزمة مرشحة. غير مبنية بعد: لا توجد تبرعات أو منح أو عضويات أو سير عمل قطاعي.',
    },
    installable: false,
    modules: [],
    roles: [],
    itemCategories: [],
    notes: [
      {
        en: 'F-PACK-10: requires separate requirements and legal/security review.',
        ar: 'يتطلب متطلبات منفصلة ومراجعة قانونية وأمنية.',
      },
    ],
  },
];

export function findPack(id: string): IndustryPackManifest | undefined {
  return INDUSTRY_PACKS.find((p) => p.id === id);
}
