import { v7 as uuidv7, validate as uuidValidate } from 'uuid';

/**
 * Branded identifiers (ADR-001). A `TenantId` cannot be passed where a `CompanyId` is expected,
 * so scoping mistakes are compile errors rather than data leaks.
 */
declare const brand: unique symbol;
export type Branded<T, B extends string> = T & { readonly [brand]: B };

export type TenantId = Branded<string, 'TenantId'>;
export type CompanyId = Branded<string, 'CompanyId'>;
export type BranchId = Branded<string, 'BranchId'>;
export type DepartmentId = Branded<string, 'DepartmentId'>;
export type UserId = Branded<string, 'UserId'>;
export type MembershipId = Branded<string, 'MembershipId'>;
export type RoleId = Branded<string, 'RoleId'>;
export type SessionId = Branded<string, 'SessionId'>;
export type PartyId = Branded<string, 'PartyId'>;
export type PartyRoleId = Branded<string, 'PartyRoleId'>;
export type ItemId = Branded<string, 'ItemId'>;
export type ItemCategoryId = Branded<string, 'ItemCategoryId'>;
export type UomId = Branded<string, 'UomId'>;
export type AuditEventId = Branded<string, 'AuditEventId'>;
export type OutboxEventId = Branded<string, 'OutboxEventId'>;
export type RequestId = Branded<string, 'RequestId'>;

/** Time-ordered UUID v7: unguessable, index-friendly. Caller names the branded type. */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the parameter brands the result
export function newId<T extends Branded<string, string>>(): T {
  return uuidv7() as T;
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidValidate(value);
}

/** Narrow an already-validated string to a branded id. Validate with Zod first at boundaries. */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the parameter brands the result
export function asId<T extends Branded<string, string>>(value: string): T {
  if (!isUuid(value)) {
    throw new TypeError(`Invalid identifier: ${String(value)}`);
  }
  return value as T;
}
