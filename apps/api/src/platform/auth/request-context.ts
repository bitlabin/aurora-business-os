import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { CompanyId, ModuleKey, PermissionKey, TenantId, UserId } from '@aurora/types';
import type { FastifyRequest } from 'fastify';

/**
 * Server-resolved request context (ADR-003). Built once per request by AuthGuard from the
 * session and the tenant's role/scope tables; never from client-supplied claims. The selected
 * company is honoured only when a scope grant exists for it.
 */
export interface RequestContext {
  requestId: string;
  user: { id: UserId; email: string; displayName: string; locale: 'en' | 'ar' };
  tenant: { id: TenantId; slug: string; name: string };
  membershipId: string;
  sessionId: string;
  sessionExpiresAt: string;
  permissions: ReadonlySet<PermissionKey>;
  /** Companies this membership may act in. */
  companyScopes: ReadonlySet<CompanyId>;
  /** Selected company (X-Company-Id), verified against companyScopes. */
  companyId: CompanyId | undefined;
  /** Modules enabled for tenant ∩ selected company. */
  modules: ReadonlySet<ModuleKey>;
  client: { ip: string | undefined; userAgent: string | undefined };
}

export type AuthedRequest = FastifyRequest & { ctx?: RequestContext };

export const Ctx = createParamDecorator(
  (_data: unknown, host: ExecutionContext): RequestContext => {
    const request = host.switchToHttp().getRequest<AuthedRequest>();
    if (!request.ctx) {
      throw new Error('RequestContext missing: route must be behind AuthGuard');
    }
    return request.ctx;
  },
);

export const IS_PUBLIC = 'aurora:public';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const PERMISSION_KEY = 'aurora:permission';
export const RequirePermission = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSION_KEY, permissions);

export const MODULE_KEY = 'aurora:module';
export const RequireModule = (module: ModuleKey) => SetMetadata(MODULE_KEY, module);

export const COMPANY_SCOPED_KEY = 'aurora:company-scoped';
/** Routes are company-scoped by default; tenant-level administration opts out. */
export const CompanyScoped = (required: boolean) => SetMetadata(COMPANY_SCOPED_KEY, required);

export const AUTH_ONLY_KEY = 'aurora:auth-only';
/**
 * Explicit marker for routes that intentionally require only authentication (plus company
 * scope where applicable) and no permission — e.g. /auth/me, /capabilities. Every non-public
 * route must carry either @RequirePermission or @AuthOnly; a test enforces it so a forgotten
 * decorator cannot silently create an auth-only endpoint.
 */
export const AuthOnly = () => SetMetadata(AUTH_ONLY_KEY, true);
