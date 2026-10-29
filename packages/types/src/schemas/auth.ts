import { z } from 'zod';
import { MODULES } from '../modules';
import { PERMISSIONS } from '../permissions';
import { localeSchema, uuidSchema } from './common';

export const loginRequestSchema = z
  .object({
    email: z.email().max(254),
    password: z.string().min(8).max(256),
    tenantSlug: z.string().trim().min(2).max(64).optional(),
  })
  .strict();
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const companySummarySchema = z.object({
  id: uuidSchema,
  code: z.string(),
  legalName: z.string(),
  tradingName: z.string().nullable(),
  baseCurrency: z.string(),
  countryCode: z.string(),
});
export type CompanySummary = z.infer<typeof companySummarySchema>;

export const sessionInfoSchema = z.object({
  user: z.object({
    id: uuidSchema,
    email: z.string(),
    displayName: z.string(),
    locale: localeSchema,
  }),
  tenant: z.object({ id: uuidSchema, slug: z.string(), name: z.string() }),
  companies: z.array(companySummarySchema),
  expiresAt: z.string(),
});
export type SessionInfo = z.infer<typeof sessionInfoSchema>;

export const navigationItemSchema = z.object({
  key: z.string(),
  module: z.enum(MODULES),
  label: z.object({ en: z.string(), ar: z.string() }),
  href: z.string(),
  order: z.number(),
});
export type NavigationItem = z.infer<typeof navigationItemSchema>;

export const capabilitiesResponseSchema = z.object({
  companyId: uuidSchema,
  modules: z.array(z.enum(MODULES)),
  permissions: z.array(z.enum(PERMISSIONS as [string, ...string[]])),
  navigation: z.array(navigationItemSchema),
  quickCreate: z.array(
    z.object({
      key: z.string(),
      label: z.object({ en: z.string(), ar: z.string() }),
      href: z.string(),
    }),
  ),
});
export type CapabilitiesResponse = z.infer<typeof capabilitiesResponseSchema>;
