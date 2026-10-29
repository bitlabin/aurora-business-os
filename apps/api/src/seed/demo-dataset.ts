import type { INestApplicationContext } from '@nestjs/common';
import { CORE_MODULES, type CreateItemRequest, type ModuleKey } from '@aurora/types';
import { CatalogService } from '../modules/catalog';
import { EntitlementService, IndustryPackService, findPack } from '../modules/entitlements';
import { IdentityService } from '../modules/identity';
import { InventoryModule, WarehouseService } from '../modules/inventory';
import { OrganizationService } from '../modules/organization';
import { PartyService } from '../modules/parties';
import { TenancyService } from '../modules/tenancy';
import { TenantProvisioningService } from '../app/provisioning/tenant-provisioning.service';

/**
 * Demo dataset (F-ROAD-001): four businesses across two tenants —
 *   Northwind Group:  service-only consultancy + construction contractor (no inventory anywhere)
 *   Harbor Retail:    retailer + distributor with lot/expiry and serial-tracked items
 * Every value is synthetic and labelled DEMO. Used by `pnpm db:seed` and by the e2e suite, so the
 * seed is itself tested.
 */
export const DEMO_PASSWORD = 'Demo!Pass123';

export interface DemoTenant {
  id: string;
  slug: string;
  companies: Record<string, string>;
  users: Record<string, { email: string; membershipId: string }>;
}

export interface DemoDataset {
  northwind: DemoTenant;
  harbor: DemoTenant;
}

const SYSTEM = { userId: undefined, requestId: 'seed' };

function packVersion(id: string): string {
  const pack = findPack(id);
  if (!pack) throw new Error(`unknown industry pack ${id}`);
  return pack.version;
}

export async function seedDemo(app: INestApplicationContext, suffix = ''): Promise<DemoDataset> {
  const provisioning = app.get(TenantProvisioningService);
  const identity = app.get(IdentityService);
  const tenancy = app.get(TenancyService);
  const organization = app.get(OrganizationService);
  const entitlements = app.get(EntitlementService);
  const packs = app.get(IndustryPackService);
  const catalog = app.get(CatalogService);
  const parties = app.get(PartyService);
  const warehouses = app.select(InventoryModule).get(WarehouseService);

  async function user(email: string, displayName: string, locale: 'en' | 'ar' = 'en') {
    const existing = await identity.findByEmail(email);
    return existing ?? identity.createUser({ email, password: DEMO_PASSWORD, displayName, locale });
  }

  async function member(tenantId: string, userId: string, roleKey: string, companyIds: string[]) {
    const membershipId = await tenancy.createMembership(tenantId, userId, SYSTEM);
    await tenancy.assignRole(tenantId, membershipId, roleKey, SYSTEM);
    for (const c of companyIds) await tenancy.grantCompanyScope(tenantId, membershipId, c, SYSTEM);
    return membershipId;
  }

  // ------------------------------------------------------------------ Northwind Group (DEMO)
  const nw = await provisioning.provision(
    { slug: `northwind-group${suffix}`, name: 'Northwind Group (DEMO)' },
    SYSTEM,
  );
  const nwc = await organization.createCompany(
    nw.id,
    {
      code: 'NWC',
      legalName: 'Northwind Consulting LLC (DEMO)',
      tradingName: 'Northwind Consulting',
      countryCode: 'US',
      baseCurrency: 'USD',
      fiscalYearStartMonth: 1,
      industryProfiles: ['general-business'],
    },
    SYSTEM,
  );
  const nwb = await organization.createCompany(
    nw.id,
    {
      code: 'NWB',
      legalName: 'Northwind Builders Inc (DEMO)',
      tradingName: 'Northwind Builders',
      countryCode: 'US',
      baseCurrency: 'USD',
      fiscalYearStartMonth: 7,
      industryProfiles: ['construction'],
    },
    SYSTEM,
  );
  await packs.install(
    nw.id,
    'general-business',
    packVersion('general-business'),
    'DEMO seed',
    SYSTEM,
  );
  await packs.install(nw.id, 'construction', packVersion('construction'), 'DEMO seed', SYSTEM);
  // The consultancy is service-only: narrow the contractor pack's modules away from it (entity_capabilities).
  for (const m of ['projects', 'purchasing'] as const)
    await entitlements.setEntityCapability(nw.id, nwc.id, m, false, 'NWC is service-only', SYSTEM);

  const nwOwner = await user(`owner@northwind${suffix}.demo`, 'Nadia Owner (DEMO)');
  const nwConsultant = await user(`consultant@northwind${suffix}.demo`, 'Carl Consultant (DEMO)');
  const nwAuditor = await user(`auditor@northwind${suffix}.demo`, 'Amira Auditor (DEMO)', 'ar');
  const northwind: DemoTenant = {
    id: nw.id,
    slug: nw.slug,
    companies: { NWC: nwc.id, NWB: nwb.id },
    users: {
      owner: {
        email: nwOwner.email,
        membershipId: await member(nw.id, nwOwner.id, 'owner', [nwc.id, nwb.id]),
      },
      consultant: {
        email: nwConsultant.email,
        membershipId: await member(nw.id, nwConsultant.id, 'sales_rep', [nwc.id]),
      },
      auditor: {
        email: nwAuditor.email,
        membershipId: await member(nw.id, nwAuditor.id, 'auditor', [nwc.id, nwb.id]),
      },
    },
  };

  const nwCategories = await catalog.listCategories(nw.id);
  const cat = (code: string) => nwCategories.find((c) => c.code === code)?.id ?? null;
  const coreOnly = new Set<ModuleKey>(CORE_MODULES);
  await catalog.createItem(
    nw.id,
    serviceItem('CONSULT-HR', 'Consulting hour', 'ساعة استشارات', 'HOUR', cat('SERVICES')),
    coreOnly,
    SYSTEM,
  );
  await catalog.createItem(
    nw.id,
    serviceItem('WORKSHOP-DAY', 'Workshop day', 'يوم ورشة عمل', 'DAY', cat('SERVICES')),
    coreOnly,
    SYSTEM,
  );
  await catalog.createItem(
    nw.id,
    serviceItem('SITE-SUPERVISION', 'Site supervision', 'إشراف موقع', 'DAY', cat('LABOR')),
    coreOnly,
    SYSTEM,
  );
  await catalog.createItem(
    nw.id,
    {
      kind: 'NONSTOCK_GOOD',
      code: 'CONCRETE-M3',
      name: { en: 'Ready-mix concrete (per m³)', ar: 'خرسانة جاهزة (للمتر المكعب)' },
      baseUomCode: 'EA',
      categoryId: cat('MATERIALS'),
      capabilities: { is_purchasable: true },
      customFields: {},
    },
    coreOnly,
    SYSTEM,
  );

  await parties.create(
    nw.id,
    {
      type: 'ORGANIZATION',
      legalName: 'Contoso Industries (DEMO)',
      primaryEmail: 'ap@contoso.demo',
      countryCode: 'US',
      roles: ['CUSTOMER'],
      tags: ['key-account'],
      customFields: {},
    },
    SYSTEM,
  );
  await parties.create(
    nw.id,
    {
      type: 'ORGANIZATION',
      legalName: 'Fabrikam Steel (DEMO)',
      primaryEmail: 'sales@fabrikam.demo',
      countryCode: 'US',
      roles: ['SUPPLIER', 'CUSTOMER'],
      tags: [],
      customFields: {},
    },
    SYSTEM,
  );
  await parties.create(
    nw.id,
    {
      type: 'PERSON',
      legalName: 'Dana Freelance (DEMO)',
      primaryPhone: '+15550100200',
      countryCode: 'US',
      roles: ['CONTRACTOR'],
      tags: [],
      customFields: {},
    },
    SYSTEM,
  );

  // ------------------------------------------------------------------ Harbor Retail Holdings (DEMO)
  const hb = await provisioning.provision(
    {
      slug: `harbor-retail${suffix}`,
      name: 'Harbor Retail Holdings (DEMO)',
      defaultLocale: 'ar',
      defaultTimezone: 'Asia/Baghdad',
    },
    SYSTEM,
  );
  const hrs = await organization.createCompany(
    hb.id,
    {
      code: 'HRS',
      legalName: 'Harbor Retail Stores Co (DEMO)',
      tradingName: 'Harbor Stores',
      countryCode: 'IQ',
      baseCurrency: 'IQD',
      fiscalYearStartMonth: 1,
      timezone: 'Asia/Baghdad',
      industryProfiles: ['retail'],
    },
    SYSTEM,
  );
  const hdl = await organization.createCompany(
    hb.id,
    {
      code: 'HDL',
      legalName: 'Harbor Distribution LLC (DEMO)',
      tradingName: 'Harbor Distribution',
      countryCode: 'US',
      baseCurrency: 'USD',
      fiscalYearStartMonth: 1,
      industryProfiles: ['distribution'],
    },
    SYSTEM,
  );
  await packs.install(hb.id, 'retail', packVersion('retail'), 'DEMO seed', SYSTEM);
  await packs.install(hb.id, 'distribution', packVersion('distribution'), 'DEMO seed', SYSTEM);
  // Only the distributor runs a warehouse operation; the store sells from a single stock location.
  await entitlements.setEntityCapability(
    hb.id,
    hrs.id,
    'warehouse',
    false,
    'HRS has no warehouse operation',
    SYSTEM,
  );
  await entitlements.setEntityCapability(
    hb.id,
    hdl.id,
    'pos',
    false,
    'HDL has no retail tills',
    SYSTEM,
  );

  const hbOwner = await user(`owner@harbor${suffix}.demo`, 'Hadi Owner (DEMO)', 'ar');
  const hbStock = await user(`stock@harbor${suffix}.demo`, 'Sami Stock (DEMO)');
  const hbCashier = await user(`cashier@harbor${suffix}.demo`, 'Lina Cashier (DEMO)', 'ar');
  const harbor: DemoTenant = {
    id: hb.id,
    slug: hb.slug,
    companies: { HRS: hrs.id, HDL: hdl.id },
    users: {
      owner: {
        email: hbOwner.email,
        membershipId: await member(hb.id, hbOwner.id, 'owner', [hrs.id, hdl.id]),
      },
      stock: {
        email: hbStock.email,
        membershipId: await member(hb.id, hbStock.id, 'inventory_controller', [hdl.id]),
      },
      cashier: {
        email: hbCashier.email,
        membershipId: await member(hb.id, hbCashier.id, 'sales_rep', [hrs.id]),
      },
    },
  };

  const hbCategories = await catalog.listCategories(hb.id);
  const hcat = (code: string) => hbCategories.find((c) => c.code === code)?.id ?? null;
  const withInventory = new Set<ModuleKey>([
    ...CORE_MODULES,
    'inventory',
    'purchasing',
    'warehouse',
    'pos',
  ]);
  await catalog.createItem(
    hb.id,
    {
      kind: 'STOCKED_GOOD',
      code: 'TSHIRT-M',
      name: { en: 'Cotton T-shirt, medium', ar: 'قميص قطني، وسط' },
      baseUomCode: 'EA',
      categoryId: hcat('MERCHANDISE'),
      capabilities: {},
      customFields: {},
      physical: {
        barcodes: [{ value: '0012345', symbology: 'OTHER', isPrimary: true }],
        weightKg: '0.180000',
      },
    },
    withInventory,
    SYSTEM,
  );
  await catalog.createItem(
    hb.id,
    {
      kind: 'STOCKED_GOOD',
      code: 'VITC-60',
      name: { en: 'Vitamin C 500mg, 60 tablets', ar: 'فيتامين سي 500 ملغ، 60 قرص' },
      baseUomCode: 'EA',
      categoryId: hcat('TRADE_GOODS'),
      capabilities: { track_lot: true, track_expiry: true },
      customFields: {},
      physical: {
        barcodes: [{ value: '6251234567890', symbology: 'EAN13', isPrimary: true }],
        casePackQuantity: '24.000000',
      },
    },
    withInventory,
    SYSTEM,
  );
  await catalog.createItem(
    hb.id,
    {
      kind: 'STOCKED_GOOD',
      code: 'SCANNER-X1',
      name: { en: 'Handheld barcode scanner X1', ar: 'ماسح باركود محمول X1' },
      baseUomCode: 'EA',
      categoryId: hcat('TRADE_GOODS'),
      capabilities: { track_serial: true },
      customFields: {},
      physical: { barcodes: [] },
    },
    withInventory,
    SYSTEM,
  );
  await catalog.createItem(
    hb.id,
    serviceItem('DELIVERY-FEE', 'Delivery fee', 'رسوم توصيل', 'EA', null),
    withInventory,
    SYSTEM,
  );

  await parties.create(
    hb.id,
    {
      type: 'ORGANIZATION',
      legalName: 'Al-Noor Pharmacy (DEMO)',
      primaryPhone: '+9647700000001',
      countryCode: 'IQ',
      roles: ['CUSTOMER'],
      tags: ['pharmacy'],
      customFields: {},
    },
    SYSTEM,
  );
  await parties.create(
    hb.id,
    {
      type: 'ORGANIZATION',
      legalName: 'Global Vitamins Supply (DEMO)',
      primaryEmail: 'orders@globalvitamins.demo',
      countryCode: 'US',
      roles: ['SUPPLIER'],
      tags: [],
      customFields: {},
    },
    SYSTEM,
  );
  await parties.create(
    hb.id,
    {
      type: 'PERSON',
      legalName: 'Walk-in customer (DEMO)',
      primaryPhone: '+9647700000002',
      countryCode: 'IQ',
      roles: ['CUSTOMER'],
      tags: ['retail'],
      customFields: {},
    },
    SYSTEM,
  );

  await warehouses.create(
    hb.id,
    hdl.id,
    { code: 'MAIN', name: { en: 'Main warehouse', ar: 'المستودع الرئيسي' } },
    SYSTEM,
  );
  await warehouses.create(
    hb.id,
    hdl.id,
    { code: 'RETURNS', name: { en: 'Returns & quarantine', ar: 'المرتجعات والحجر' } },
    SYSTEM,
  );

  return { northwind, harbor };
}

function serviceItem(
  code: string,
  en: string,
  ar: string,
  uom: string,
  categoryId: string | null,
): CreateItemRequest {
  return {
    kind: 'SERVICE',
    code,
    name: { en, ar },
    baseUomCode: uom,
    categoryId,
    capabilities: {},
    customFields: {},
  };
}
