import { z } from 'zod';
import { ITEM_CAPABILITIES, ITEM_KINDS, ITEM_KIND_POLICIES, type ItemKind } from '../item-kinds';
import {
  auditStampSchema,
  customFieldsSchema,
  decimalStringSchema,
  listQuerySchema,
  localizedTextSchema,
  pageSchema,
  uuidSchema,
} from './common';

export const itemKindSchema = z.enum(ITEM_KINDS);

export const ITEM_STATUSES = ['DRAFT', 'ACTIVE', 'DISCONTINUED', 'ARCHIVED'] as const;
export const itemStatusSchema = z.enum(ITEM_STATUSES);
export type ItemStatus = z.infer<typeof itemStatusSchema>;

export const itemCapabilitiesSchema = z.object(
  Object.fromEntries(ITEM_CAPABILITIES.map((c) => [c, z.boolean()])) as Record<
    (typeof ITEM_CAPABILITIES)[number],
    z.ZodBoolean
  >,
);
export const partialItemCapabilitiesSchema = itemCapabilitiesSchema.partial().strict();

/** Barcodes are strings: leading zeros preserved (T-022). */
export const barcodeSchema = z.object({
  value: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9\-._]{4,64}$/),
  symbology: z
    .enum(['EAN13', 'EAN8', 'UPCA', 'CODE128', 'GS1_128', 'QR', 'OTHER'])
    .default('OTHER'),
  isPrimary: z.boolean().default(false),
});

/** Physical profile: only accepted for kinds whose policy says `physical: true` (ADR-005). */
export const physicalProfileSchema = z
  .object({
    barcodes: z.array(barcodeSchema).max(20).default([]),
    weightKg: decimalStringSchema.nullable().optional(),
    lengthCm: decimalStringSchema.nullable().optional(),
    widthCm: decimalStringSchema.nullable().optional(),
    heightCm: decimalStringSchema.nullable().optional(),
    casePackQuantity: decimalStringSchema.nullable().optional(),
  })
  .strict();
export type PhysicalProfile = z.infer<typeof physicalProfileSchema>;

const itemCommon = z.object({
  code: z.string().trim().min(1).max(80),
  name: localizedTextSchema,
  description: z.string().trim().max(4000).nullable().optional(),
  categoryId: uuidSchema.nullable().optional(),
  baseUomCode: z.string().trim().min(1).max(16),
  capabilities: partialItemCapabilitiesSchema.default({}),
  customFields: customFieldsSchema.default({}),
});

function physicalKind<K extends ItemKind>(kind: K) {
  if (!ITEM_KIND_POLICIES[kind].physical) throw new Error(`${kind} is not a physical kind`);
  return itemCommon
    .extend({ kind: z.literal(kind), physical: physicalProfileSchema.optional() })
    .strict();
}

function intangibleKind<K extends ItemKind>(kind: K) {
  if (ITEM_KIND_POLICIES[kind].physical) throw new Error(`${kind} is a physical kind`);
  return itemCommon.extend({ kind: z.literal(kind) }).strict();
}

/**
 * Discriminated by `kind`: a SERVICE payload containing `physical` is rejected by the schema
 * itself ("unrecognized key"), so a warehouse, barcode or expiry can never be required of it.
 * The split between physical and intangible kinds mirrors ITEM_KIND_POLICIES and is asserted at
 * module load so the two cannot drift.
 */
export const createItemRequestSchema = z.discriminatedUnion('kind', [
  physicalKind('STOCKED_GOOD'),
  physicalKind('NONSTOCK_GOOD'),
  intangibleKind('SERVICE'),
  intangibleKind('DIGITAL_GOOD'),
  intangibleKind('BUNDLE'),
  intangibleKind('SUBSCRIPTION_PLAN'),
  physicalKind('RENTAL_ASSET'),
  physicalKind('MANUFACTURED_GOOD'),
]);
export type CreateItemRequest = z.infer<typeof createItemRequestSchema>;

export const updateItemRequestSchema = itemCommon
  .omit({ code: true, capabilities: true })
  .partial()
  .extend({
    capabilities: partialItemCapabilitiesSchema.optional(),
    physical: physicalProfileSchema.optional(),
  })
  .strict();
export type UpdateItemRequest = z.infer<typeof updateItemRequestSchema>;

export const itemSchema = itemCommon
  .omit({ capabilities: true })
  .extend({
    id: uuidSchema,
    tenantId: uuidSchema,
    kind: itemKindSchema,
    status: itemStatusSchema,
    capabilities: itemCapabilitiesSchema,
    physical: physicalProfileSchema.nullable(),
  })
  .extend(auditStampSchema.shape);
export type Item = z.infer<typeof itemSchema>;

export const itemListQuerySchema = listQuerySchema.extend({
  kind: itemKindSchema.optional(),
  status: itemStatusSchema.optional(),
  categoryId: uuidSchema.optional(),
});
export type ItemListQuery = z.infer<typeof itemListQuerySchema>;

export const itemPageSchema = pageSchema(itemSchema);

export const itemCategorySchema = z.object({
  id: uuidSchema,
  code: z.string(),
  name: localizedTextSchema,
  parentId: uuidSchema.nullable(),
});
export type ItemCategory = z.infer<typeof itemCategorySchema>;

export const createItemCategoryRequestSchema = z
  .object({
    code: z.string().trim().min(1).max(40),
    name: localizedTextSchema,
    parentId: uuidSchema.nullable().optional(),
  })
  .strict();
