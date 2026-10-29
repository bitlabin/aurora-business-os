import { z } from 'zod';
import {
  auditStampSchema,
  customFieldsSchema,
  listQuerySchema,
  pageSchema,
  uuidSchema,
} from './common';

/** CORE-IND-004: one identity, many roles. */
export const PARTY_TYPES = ['PERSON', 'ORGANIZATION'] as const;
export const partyTypeSchema = z.enum(PARTY_TYPES);
export type PartyType = z.infer<typeof partyTypeSchema>;

export const PARTY_ROLES = [
  'PROSPECT',
  'CUSTOMER',
  'SUPPLIER',
  'CONTRACTOR',
  'CONTACT',
  'EMPLOYEE',
] as const;
export const partyRoleSchema = z.enum(PARTY_ROLES);
export type PartyRole = z.infer<typeof partyRoleSchema>;

export const PARTY_STATUSES = ['ACTIVE', 'ON_HOLD', 'BLOCKED', 'ARCHIVED'] as const;
export const partyStatusSchema = z.enum(PARTY_STATUSES);
export type PartyStatus = z.infer<typeof partyStatusSchema>;

const e164 = z.string().regex(/^\+[1-9]\d{6,14}$/, 'E.164 phone number');

export const partyBaseSchema = z.object({
  type: partyTypeSchema,
  legalName: z.string().trim().min(1).max(200),
  tradeName: z.string().trim().min(1).max(200).nullable().optional(),
  primaryEmail: z.email().max(254).nullable().optional(),
  primaryPhone: e164.nullable().optional(),
  countryCode: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable()
    .optional(),
  /** Format is jurisdiction-specific; validated against configuration, never assumed. */
  taxRegistrationId: z.string().trim().min(1).max(64).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  customFields: customFieldsSchema.default({}),
});

export const createPartyRequestSchema = partyBaseSchema
  .extend({
    roles: z.array(partyRoleSchema).min(1).max(PARTY_ROLES.length),
  })
  .strict()
  .refine((p) => Boolean(p.primaryEmail) || Boolean(p.primaryPhone), {
    message: 'At least one contact channel (email or phone) is required',
    path: ['primaryEmail'],
  });
export type CreatePartyRequest = z.infer<typeof createPartyRequestSchema>;

export const updatePartyRequestSchema = partyBaseSchema.partial().strict();
export type UpdatePartyRequest = z.infer<typeof updatePartyRequestSchema>;

export const partySchema = partyBaseSchema
  .extend({
    id: uuidSchema,
    tenantId: uuidSchema,
    status: partyStatusSchema,
    roles: z.array(partyRoleSchema),
  })
  .extend(auditStampSchema.shape);
export type Party = z.infer<typeof partySchema>;

export const partyListQuerySchema = listQuerySchema.extend({
  role: partyRoleSchema.optional(),
  status: partyStatusSchema.optional(),
  type: partyTypeSchema.optional(),
});
export type PartyListQuery = z.infer<typeof partyListQuerySchema>;

export const partyPageSchema = pageSchema(partySchema);
export type PartyPage = z.infer<typeof partyPageSchema>;

export const addPartyRoleRequestSchema = z.object({ role: partyRoleSchema }).strict();
