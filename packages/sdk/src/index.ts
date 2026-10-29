import {
  type ApiErrorBody,
  type CapabilitiesResponse,
  type CompanySummary,
  type CreateItemRequest,
  type CreatePartyRequest,
  type Entitlement,
  type IndustryPackSummary,
  type Item,
  type ItemCategory,
  type ItemListQuery,
  type LoginRequest,
  type PackDiff,
  type Party,
  type PartyListQuery,
  type PartyRole,
  type SessionInfo,
  type UpdateItemRequest,
  type UpdatePartyRequest,
  capabilitiesResponseSchema,
  companySummarySchema,
  entitlementListSchema,
  industryPackSummarySchema,
  itemCategorySchema,
  itemPageSchema,
  itemSchema,
  packDiffSchema,
  partyPageSchema,
  partySchema,
  sessionInfoSchema,
} from '@aurora/types';
import { z } from 'zod';

/**
 * Typed API client built on the shared Zod contracts (ADR-002): every response is validated at
 * the boundary so the UI never renders a shape the API did not promise.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.message);
    this.name = 'ApiError';
  }

  get code(): ApiErrorBody['code'] {
    return this.body.code;
  }
}

export interface ApiClientOptions {
  /** Base URL without trailing slash; '' for same-origin (Next.js rewrite). */
  baseUrl?: string;
  /** Bearer token for non-browser clients; browsers rely on the HttpOnly cookie. */
  token?: string;
  companyId?: string;
  fetch?: typeof fetch;
}

type LoginResponse =
  | {
      status: 'ok';
      token: string;
      expiresAt: string;
      tenant: { id: string; slug: string; name: string };
    }
  | { status: 'tenant_required'; tenants: { id: string; slug: string; name: string }[] };

const loginResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    token: z.string(),
    expiresAt: z.string(),
    tenant: z.object({ id: z.string(), slug: z.string(), name: z.string() }),
  }),
  z.object({
    status: z.literal('tenant_required'),
    tenants: z.array(z.object({ id: z.string(), slug: z.string(), name: z.string() })),
  }),
]);

const okSchema = z.object({ ok: z.literal(true) });
const warehouseSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.object({ en: z.string(), ar: z.string().optional() }),
  status: z.string(),
});
const auditPageSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      seq: z.number(),
      occurredAt: z.string(),
      actorUserId: z.string().nullable(),
      actorType: z.string(),
      action: z.string(),
      subjectType: z.string(),
      subjectId: z.string(),
      before: z.record(z.string(), z.unknown()).nullable(),
      after: z.record(z.string(), z.unknown()).nullable(),
      reason: z.string().nullable(),
      sensitive: z.boolean(),
    }),
  ),
  nextCursor: z.string().nullable(),
});
const memberSchema = z.object({
  id: z.string(),
  userId: z.string(),
  status: z.string(),
  roles: z.array(z.string()),
  scopes: z.array(z.object({ type: z.string(), id: z.string() })),
});
const roleSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.object({ en: z.string(), ar: z.string().optional() }),
  isSystem: z.boolean(),
  permissions: z.array(z.string()),
});
const uomSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.object({ en: z.string(), ar: z.string().optional() }),
  kind: z.string(),
  decimals: z.number(),
});

export type Warehouse = z.infer<typeof warehouseSchema>;
export type AuditPage = z.infer<typeof auditPageSchema>;
export type Member = z.infer<typeof memberSchema>;
export type Role = z.infer<typeof roleSchema>;
export type Uom = z.infer<typeof uomSchema>;

function toQuery(params: Record<string, string | number | boolean | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}

export class AuroraClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  token: string | undefined;
  companyId: string | undefined;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? '';
    this.fetchImpl = options.fetch ?? fetch;
    this.token = options.token;
    this.companyId = options.companyId;
  }

  withCompany(companyId: string | undefined): AuroraClient {
    const c = new AuroraClient({
      baseUrl: this.baseUrl,
      fetch: this.fetchImpl,
      token: this.token,
      companyId,
    });
    return c;
  }

  private async request<T>(
    method: string,
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/v1${path}`, {
      method,
      credentials: 'include',
      headers: {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        ...(this.companyId ? { 'x-company-id': this.companyId } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const json: unknown = text.length > 0 ? JSON.parse(text) : undefined;
    if (!res.ok) {
      throw new ApiError(res.status, json as ApiErrorBody);
    }
    return schema.parse(json);
  }

  // ---- auth
  login(input: LoginRequest): Promise<LoginResponse> {
    return this.request('POST', '/auth/login', loginResponseSchema, input);
  }
  logout(): Promise<{ ok: true }> {
    return this.request('POST', '/auth/logout', okSchema);
  }
  me(): Promise<SessionInfo> {
    return this.request('GET', '/auth/me', sessionInfoSchema);
  }
  capabilities(): Promise<CapabilitiesResponse> {
    return this.request('GET', '/capabilities', capabilitiesResponseSchema);
  }

  // ---- organization
  companies(): Promise<CompanySummary[]> {
    return this.request('GET', '/companies', z.array(companySummarySchema));
  }

  // ---- parties
  parties(
    query: Partial<PartyListQuery> = {},
  ): Promise<{ items: Party[]; nextCursor: string | null }> {
    return this.request('GET', `/parties${toQuery(query)}`, partyPageSchema);
  }
  party(id: string): Promise<Party> {
    return this.request('GET', `/parties/${id}`, partySchema);
  }
  createParty(input: CreatePartyRequest): Promise<Party> {
    return this.request('POST', '/parties', partySchema, input);
  }
  updateParty(id: string, version: number, input: UpdatePartyRequest): Promise<Party> {
    return this.request('PATCH', `/parties/${id}`, partySchema, input, {
      'if-match': `"version-${version}"`,
    });
  }
  addPartyRole(id: string, role: PartyRole): Promise<Party> {
    return this.request('POST', `/parties/${id}/roles`, partySchema, { role });
  }
  archiveParty(id: string): Promise<{ ok: true }> {
    return this.request('DELETE', `/parties/${id}`, okSchema);
  }

  // ---- catalog
  items(query: Partial<ItemListQuery> = {}): Promise<{ items: Item[]; nextCursor: string | null }> {
    return this.request('GET', `/items${toQuery(query)}`, itemPageSchema);
  }
  item(id: string): Promise<Item> {
    return this.request('GET', `/items/${id}`, itemSchema);
  }
  createItem(input: CreateItemRequest): Promise<Item> {
    return this.request('POST', '/items', itemSchema, input);
  }
  updateItem(id: string, version: number, input: UpdateItemRequest): Promise<Item> {
    return this.request('PATCH', `/items/${id}`, itemSchema, input, {
      'if-match': `"version-${version}"`,
    });
  }
  archiveItem(id: string): Promise<{ ok: true }> {
    return this.request('DELETE', `/items/${id}`, okSchema);
  }
  itemCategories(): Promise<ItemCategory[]> {
    return this.request('GET', '/item-categories', z.array(itemCategorySchema));
  }
  uoms(): Promise<Uom[]> {
    return this.request('GET', '/uoms', z.array(uomSchema));
  }

  // ---- inventory (module-gated; 404 MODULE_DISABLED when off)
  warehouses(): Promise<Warehouse[]> {
    return this.request('GET', '/warehouses', z.array(warehouseSchema));
  }
  createWarehouse(input: { code: string; name: { en: string; ar?: string } }): Promise<Warehouse> {
    return this.request('POST', '/warehouses', warehouseSchema, input);
  }

  // ---- administration
  entitlements(): Promise<{ tenantId: string; entitlements: Entitlement[] }> {
    return this.request('GET', '/admin/entitlements', entitlementListSchema);
  }
  enableModule(module: string, reason: string): Promise<{ ok: true }> {
    return this.request('POST', `/admin/entitlements/${module}/enable`, okSchema, { reason });
  }
  disableModule(module: string, reason: string): Promise<{ ok: true }> {
    return this.request('POST', `/admin/entitlements/${module}/disable`, okSchema, { reason });
  }
  industryPacks(): Promise<IndustryPackSummary[]> {
    return this.request('GET', '/industry-packs', z.array(industryPackSummarySchema));
  }
  previewPack(id: string): Promise<PackDiff & { notes: { en: string; ar: string }[] }> {
    return this.request(
      'POST',
      `/industry-packs/${id}/preview`,
      packDiffSchema.extend({ notes: z.array(z.object({ en: z.string(), ar: z.string() })) }),
    );
  }
  installPack(id: string, version: string, reason: string): Promise<PackDiff> {
    return this.request('POST', `/industry-packs/${id}/install`, packDiffSchema, {
      version,
      reason,
    });
  }
  members(): Promise<Member[]> {
    return this.request('GET', '/admin/members', z.array(memberSchema));
  }
  roles(): Promise<Role[]> {
    return this.request('GET', '/admin/roles', z.array(roleSchema));
  }
  auditEvents(
    query: { limit?: number; cursor?: string; subjectType?: string; subjectId?: string } = {},
  ): Promise<AuditPage> {
    return this.request('GET', `/admin/audit-events${toQuery(query)}`, auditPageSchema);
  }
}

export type { LoginResponse };
