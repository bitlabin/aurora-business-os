import type { IndustryPackId, LocalizedText, ModuleKey, PermissionKey } from '@aurora/types';

/**
 * Industry pack manifest (ADR-004, CORE-IND-003): a versioned preset of configuration. Packs
 * never carry code paths of their own; they only reference modules, roles and categories the
 * shared core already understands.
 */
export interface IndustryPackManifest {
  id: IndustryPackId;
  version: string;
  name: { en: string; ar: string };
  description: { en: string; ar: string };
  /** False for packs whose workflows are not engineered yet (F-PACK-10). Listed, not installable. */
  installable: boolean;
  /** Optional modules to enable at tenant level. Core modules are implied. */
  modules: ModuleKey[];
  roles: { key: string; name: LocalizedText; permissions: PermissionKey[] }[];
  itemCategories: { code: string; name: LocalizedText }[];
  /** Human-readable notes shown in the preview (e.g. "requires controller sign-off for WIP"). */
  notes: { en: string; ar: string }[];
}

export interface PackState {
  enabledModules: ReadonlySet<ModuleKey>;
  existingRoleKeys: ReadonlySet<string>;
  existingCategoryCodes: ReadonlySet<string>;
  installedVersion: string | null;
}

export interface PackDiffResult {
  packId: IndustryPackId;
  version: string;
  modulesToEnable: ModuleKey[];
  modulesAlreadyEnabled: ModuleKey[];
  rolesToCreate: string[];
  rolesExisting: string[];
  itemCategoriesToCreate: string[];
  itemCategoriesExisting: string[];
  conflicts: { kind: string; message: string }[];
  touches: string[];
}

/** Pure diff: what installing `pack` would change given the tenant's current state. */
export function diffPack(pack: IndustryPackManifest, state: PackState): PackDiffResult {
  const conflicts: PackDiffResult['conflicts'] = [];
  if (!pack.installable) {
    conflicts.push({
      kind: 'not_installable',
      message: `${pack.id} is a roadmap pack; its workflows are not engineered yet`,
    });
  }
  if (state.installedVersion === pack.version) {
    conflicts.push({
      kind: 'already_installed',
      message: `${pack.id}@${pack.version} is already installed`,
    });
  }
  const modulesToEnable = pack.modules.filter((m) => !state.enabledModules.has(m));
  const modulesAlreadyEnabled = pack.modules.filter((m) => state.enabledModules.has(m));
  const rolesToCreate = pack.roles.map((r) => r.key).filter((k) => !state.existingRoleKeys.has(k));
  const rolesExisting = pack.roles.map((r) => r.key).filter((k) => state.existingRoleKeys.has(k));
  const itemCategoriesToCreate = pack.itemCategories
    .map((c) => c.code)
    .filter((c) => !state.existingCategoryCodes.has(c));
  const itemCategoriesExisting = pack.itemCategories
    .map((c) => c.code)
    .filter((c) => state.existingCategoryCodes.has(c));

  const touches = [
    'tenant_industry_packs',
    'config_install_events',
    'audit_events',
    'outbox_events',
  ];
  if (modulesToEnable.length > 0) touches.push('module_entitlements');
  if (rolesToCreate.length > 0) touches.push('roles', 'role_permissions');
  if (itemCategoriesToCreate.length > 0) touches.push('item_categories');

  return {
    packId: pack.id,
    version: pack.version,
    modulesToEnable,
    modulesAlreadyEnabled,
    rolesToCreate,
    rolesExisting,
    itemCategoriesToCreate,
    itemCategoriesExisting,
    conflicts,
    touches,
  };
}
