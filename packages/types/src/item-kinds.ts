/**
 * Universal item kinds and their capability policies (ADR-005, F-ITEM-001/002).
 *
 * This is shared data used by both the API domain layer (enforcement) and the web app (which
 * fields to render). The database mirrors the hard rules as CHECK constraints.
 */
export const ITEM_KINDS = [
  'STOCKED_GOOD',
  'NONSTOCK_GOOD',
  'SERVICE',
  'DIGITAL_GOOD',
  'BUNDLE',
  'SUBSCRIPTION_PLAN',
  'RENTAL_ASSET',
  'MANUFACTURED_GOOD',
] as const;

export type ItemKind = (typeof ITEM_KINDS)[number];

export const ITEM_CAPABILITIES = [
  'track_inventory',
  'track_lot',
  'track_serial',
  'track_expiry',
  'track_location',
  'is_sellable',
  'is_purchasable',
  'is_billable',
  'is_taxable',
  'requires_fulfillment',
] as const;

export type ItemCapability = (typeof ITEM_CAPABILITIES)[number];

export type ItemCapabilities = Record<ItemCapability, boolean>;

/** `allowed`: may be true. `defaults`: value when omitted. Anything not allowed must be false. */
export interface ItemKindPolicy {
  kind: ItemKind;
  /** Does this kind support a physical profile (barcode, dimensions, pack conversions)? */
  physical: boolean;
  /** Does this kind require the inventory module to be enabled for the entity? */
  requiresInventoryModule: boolean;
  allowed: readonly ItemCapability[];
  defaults: ItemCapabilities;
  label: { en: string; ar: string };
}

const base: ItemCapabilities = {
  track_inventory: false,
  track_lot: false,
  track_serial: false,
  track_expiry: false,
  track_location: false,
  is_sellable: true,
  is_purchasable: false,
  is_billable: true,
  is_taxable: true,
  requires_fulfillment: false,
};

const COMMERCIAL: readonly ItemCapability[] = [
  'is_sellable',
  'is_purchasable',
  'is_billable',
  'is_taxable',
];
const PHYSICAL: readonly ItemCapability[] = [
  'track_inventory',
  'track_lot',
  'track_serial',
  'track_expiry',
  'track_location',
  'requires_fulfillment',
];

export const ITEM_KIND_POLICIES: Record<ItemKind, ItemKindPolicy> = {
  STOCKED_GOOD: {
    kind: 'STOCKED_GOOD',
    physical: true,
    requiresInventoryModule: true,
    allowed: [...COMMERCIAL, ...PHYSICAL],
    defaults: { ...base, track_inventory: true, is_purchasable: true, requires_fulfillment: true },
    label: { en: 'Stocked good', ar: 'سلعة مخزنة' },
  },
  NONSTOCK_GOOD: {
    kind: 'NONSTOCK_GOOD',
    physical: true,
    requiresInventoryModule: false,
    allowed: [...COMMERCIAL, 'requires_fulfillment'],
    defaults: { ...base, is_purchasable: true },
    label: { en: 'Non-stock good', ar: 'سلعة غير مخزنة' },
  },
  SERVICE: {
    kind: 'SERVICE',
    physical: false,
    requiresInventoryModule: false,
    allowed: COMMERCIAL,
    defaults: { ...base },
    label: { en: 'Service', ar: 'خدمة' },
  },
  DIGITAL_GOOD: {
    kind: 'DIGITAL_GOOD',
    physical: false,
    requiresInventoryModule: false,
    allowed: COMMERCIAL,
    defaults: { ...base },
    label: { en: 'Digital good', ar: 'منتج رقمي' },
  },
  BUNDLE: {
    kind: 'BUNDLE',
    physical: false,
    requiresInventoryModule: false,
    allowed: ['is_sellable', 'is_billable', 'is_taxable', 'requires_fulfillment'],
    defaults: { ...base },
    label: { en: 'Bundle', ar: 'حزمة' },
  },
  SUBSCRIPTION_PLAN: {
    kind: 'SUBSCRIPTION_PLAN',
    physical: false,
    requiresInventoryModule: false,
    allowed: ['is_sellable', 'is_billable', 'is_taxable'],
    defaults: { ...base },
    label: { en: 'Subscription plan', ar: 'خطة اشتراك' },
  },
  RENTAL_ASSET: {
    kind: 'RENTAL_ASSET',
    physical: true,
    requiresInventoryModule: false,
    allowed: ['is_billable', 'is_taxable', 'track_serial', 'track_location'],
    defaults: { ...base, is_sellable: false, track_serial: true },
    label: { en: 'Rental asset', ar: 'أصل للتأجير' },
  },
  MANUFACTURED_GOOD: {
    kind: 'MANUFACTURED_GOOD',
    physical: true,
    requiresInventoryModule: true,
    allowed: [...COMMERCIAL, ...PHYSICAL],
    defaults: { ...base, track_inventory: true, requires_fulfillment: true },
    label: { en: 'Manufactured good', ar: 'منتج مصنّع' },
  },
};

export function isItemKind(value: unknown): value is ItemKind {
  return typeof value === 'string' && (ITEM_KINDS as readonly string[]).includes(value);
}

export interface CapabilityViolation {
  capability: ItemCapability;
  reason: string;
}

/**
 * Resolve the effective capability set for a kind from a partial request, returning violations
 * instead of throwing so the caller can report all problems at once.
 */
export function resolveItemCapabilities(
  kind: ItemKind,
  requested: Partial<ItemCapabilities> = {},
): { capabilities: ItemCapabilities; violations: CapabilityViolation[] } {
  const policy = ITEM_KIND_POLICIES[kind];
  const violations: CapabilityViolation[] = [];
  const capabilities: ItemCapabilities = { ...policy.defaults };

  for (const cap of ITEM_CAPABILITIES) {
    const value = requested[cap];
    if (value === undefined) continue;
    if (value && !policy.allowed.includes(cap)) {
      violations.push({ capability: cap, reason: `${cap} is not permitted for item kind ${kind}` });
      continue;
    }
    capabilities[cap] = value;
  }

  // Cross-capability rules
  if (
    (capabilities.track_lot || capabilities.track_serial || capabilities.track_expiry) &&
    !capabilities.track_inventory
  ) {
    if (kind !== 'RENTAL_ASSET') {
      violations.push({
        capability: 'track_inventory',
        reason: 'lot, serial or expiry tracking requires track_inventory',
      });
    }
  }
  if (capabilities.track_lot && capabilities.track_serial) {
    violations.push({
      capability: 'track_serial',
      reason: 'an item is either lot-tracked or serial-tracked, not both',
    });
  }
  if (capabilities.track_expiry && !capabilities.track_lot) {
    violations.push({
      capability: 'track_expiry',
      reason: 'expiry tracking requires lot tracking',
    });
  }

  return { capabilities, violations };
}
