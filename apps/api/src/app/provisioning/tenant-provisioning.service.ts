import { Injectable } from '@nestjs/common';
import type { TenantRecord } from '../../modules/tenancy';
import { CatalogService } from '../../modules/catalog';
import { EntitlementService } from '../../modules/entitlements';
import { TenancyService } from '../../modules/tenancy';

/**
 * Creates a tenant with everything a tenant needs to function: baseline roles, core module
 * entitlements and default units. Used by the demo seed and tests; a self-service version is a
 * Phase 5 (SaaS-001) feature.
 */
@Injectable()
export class TenantProvisioningService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly entitlements: EntitlementService,
    private readonly catalog: CatalogService,
  ) {}

  async provision(
    input: { slug: string; name: string; defaultLocale?: 'en' | 'ar'; defaultTimezone?: string },
    actor: { userId?: string | undefined; requestId?: string | undefined },
  ): Promise<TenantRecord> {
    const tenant = await this.tenancy.createTenant(input, actor);
    await this.tenancy.seedRoleTemplates(tenant.id, actor);
    await this.entitlements.ensureCoreEntitlements(tenant.id, actor);
    await this.catalog.ensureDefaultUoms(tenant.id, actor);
    return tenant;
  }
}
