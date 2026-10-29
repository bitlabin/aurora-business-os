import { z } from 'zod';
import { MODULES } from '../modules';
import { uuidSchema } from './common';

export const moduleKeySchema = z.enum(MODULES);

export const entitlementSchema = z.object({
  module: moduleKeySchema,
  core: z.boolean(),
  enabled: z.boolean(),
  enabledAt: z.string().nullable(),
  disabledAt: z.string().nullable(),
  reason: z.string().nullable(),
});
export type Entitlement = z.infer<typeof entitlementSchema>;

export const entitlementListSchema = z.object({
  tenantId: uuidSchema,
  entitlements: z.array(entitlementSchema),
});

export const changeEntitlementRequestSchema = z
  .object({
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
export type ChangeEntitlementRequest = z.infer<typeof changeEntitlementRequestSchema>;

export const setEntityCapabilityRequestSchema = z
  .object({
    companyId: uuidSchema,
    enabled: z.boolean(),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

/** Industry packs (ADR-004, CORE-IND-003). */
export const INDUSTRY_PACK_IDS = [
  'general-business',
  'professional-services',
  'retail',
  'distribution',
  'construction',
  'manufacturing',
  'field-service',
  'rental',
  'technology-digital',
  'nonprofit',
] as const;
export const industryPackIdSchema = z.enum(INDUSTRY_PACK_IDS);
export type IndustryPackId = z.infer<typeof industryPackIdSchema>;

export const industryPackSummarySchema = z.object({
  id: industryPackIdSchema,
  version: z.string(),
  name: z.object({ en: z.string(), ar: z.string() }),
  description: z.object({ en: z.string(), ar: z.string() }),
  modules: z.array(moduleKeySchema),
  /** Packs whose workflows are not yet engineered are listed but not installable (F-PACK-10). */
  installable: z.boolean(),
  installed: z
    .object({
      version: z.string(),
      installedAt: z.string(),
      status: z.enum(['installed', 'removed']),
    })
    .nullable(),
});
export type IndustryPackSummary = z.infer<typeof industryPackSummarySchema>;

export const packDiffSchema = z.object({
  packId: industryPackIdSchema,
  version: z.string(),
  modulesToEnable: z.array(moduleKeySchema),
  modulesAlreadyEnabled: z.array(moduleKeySchema),
  rolesToCreate: z.array(z.string()),
  rolesExisting: z.array(z.string()),
  itemCategoriesToCreate: z.array(z.string()),
  itemCategoriesExisting: z.array(z.string()),
  conflicts: z.array(z.object({ kind: z.string(), message: z.string() })),
  /** Tables the installation would write to; posted/operational tables are never listed. */
  touches: z.array(z.string()),
});
export type PackDiff = z.infer<typeof packDiffSchema>;

export const installPackRequestSchema = z
  .object({
    /** Must equal the version returned by preview, so an approval cannot apply a different diff. */
    version: z.string(),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
