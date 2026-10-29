import { z } from 'zod';

export const uuidSchema = z.uuid();

/** Localized text: at least English; Arabic optional (FDD NFR-008). */
export const localizedTextSchema = z
  .object({
    en: z.string().trim().min(1).max(200),
    ar: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
export type LocalizedText = z.infer<typeof localizedTextSchema>;

export const decimalStringSchema = z
  .string()
  .regex(/^-?\d+(\.\d{1,6})?$/, 'Expected a decimal string with up to 6 fraction digits');

export const currencyCodeSchema = z.string().regex(/^[A-Z]{3}$/, 'ISO 4217 currency code');

export const moneySchema = z
  .object({ amount: decimalStringSchema, currency: currencyCodeSchema })
  .strict();

export const localeSchema = z.enum(['en', 'ar']);
export type Locale = z.infer<typeof localeSchema>;

/** Cursor pagination (FDD §21.1). */
export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(512).optional(),
  q: z.string().trim().max(200).optional(),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });
}

/** Ancillary tenant-defined attributes; validated per-module against registered definitions. */
export const customFieldsSchema = z.record(
  z.string().max(64),
  z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]),
);

export const auditStampSchema = z.object({
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: uuidSchema.nullable(),
  updatedBy: uuidSchema.nullable(),
  version: z.number().int(),
});
