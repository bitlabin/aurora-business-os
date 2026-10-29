import {
  AppError,
  type ItemCapabilities,
  type ItemKind,
  ITEM_KIND_POLICIES,
  resolveItemCapabilities,
  type ModuleKey,
} from '@aurora/types';

/** Codes are compared case-insensitively with whitespace trimmed; display form is preserved. */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Domain rule (ADR-005, F-ITEM-002): validate requested capabilities against the kind policy and
 * the modules the entity has enabled. Pure; the database CHECK constraints are the backstop.
 */
export function validateItemCapabilities(
  kind: ItemKind,
  requested: Partial<ItemCapabilities>,
  enabledModules: ReadonlySet<ModuleKey>,
): ItemCapabilities {
  const { capabilities, violations } = resolveItemCapabilities(kind, requested);
  if (violations.length > 0) {
    throw AppError.businessRule(
      'Capabilities are not valid for this item kind',
      violations.map((v) => ({ path: `capabilities.${v.capability}`, message: v.reason })),
    );
  }
  if (ITEM_KIND_POLICIES[kind].requiresInventoryModule && !enabledModules.has('inventory')) {
    throw AppError.businessRule(
      `Item kind ${kind} requires the inventory module, which is not enabled for this company`,
      [{ path: 'kind', message: 'inventory module not enabled' }],
    );
  }
  if (capabilities.track_inventory && !enabledModules.has('inventory')) {
    throw AppError.businessRule('track_inventory requires the inventory module', [
      { path: 'capabilities.track_inventory', message: 'inventory module not enabled' },
    ]);
  }
  return capabilities;
}
