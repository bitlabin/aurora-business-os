import { Injectable } from '@nestjs/common';
import type { CompanyId } from '@aurora/types';
import type { AccessResolver } from '../../platform/auth/access-resolver';
import type { RequestContext } from '../../platform/auth/request-context';
import { EntitlementService } from '../../modules/entitlements';
import { IdentityService } from '../../modules/identity';
import { TenancyService } from '../../modules/tenancy';

/**
 * Composes identity (who), tenancy (what they may do, where) and entitlements (which modules)
 * into one server-resolved RequestContext per request (ADR-003).
 */
@Injectable()
export class CompositeAccessResolver implements AccessResolver {
  constructor(
    private readonly identity: IdentityService,
    private readonly tenancy: TenancyService,
    private readonly entitlements: EntitlementService,
  ) {}

  async resolve(input: {
    token: string;
    requestId: string;
    companyId: string | undefined;
    ip: string | undefined;
    userAgent: string | undefined;
  }): Promise<RequestContext | null> {
    const session = await this.identity.resolveSession(input.token);
    if (!session) return null;

    const tenant = await this.tenancy.getTenant(session.tenantId);
    if (tenant?.status !== 'active') return null;

    const access = await this.tenancy.resolveAccess(tenant.id, session.user.id);
    if (!access) return null;

    // The requested company is honoured only if a scope grant exists; otherwise the request is
    // treated as having no company (company-scoped routes then answer 403).
    const companyId =
      input.companyId !== undefined && access.companyIds.has(input.companyId as CompanyId)
        ? (input.companyId as CompanyId)
        : undefined;
    const modules = await this.entitlements.effectiveModules(tenant.id, companyId);

    return {
      requestId: input.requestId,
      user: session.user,
      tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
      membershipId: access.membershipId,
      sessionId: session.sessionId,
      sessionExpiresAt: session.expiresAt,
      permissions: access.permissions,
      companyScopes: access.companyIds,
      companyId,
      modules,
      client: { ip: input.ip, userAgent: input.userAgent },
    };
  }
}
