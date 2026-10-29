import { Module } from '@nestjs/common';
import { AuditModule } from '../audit';
import { CatalogModule } from '../catalog';
import { TenancyModule } from '../tenancy';
import {
  CapabilitiesController,
  EntitlementsAdminController,
  IndustryPacksController,
} from './api/entitlements.controller';
import { DeactivationGuardRegistry, EntitlementService } from './application/entitlement.service';
import { IndustryPackService } from './application/industry-pack.service';

export {
  EntitlementService,
  DeactivationGuardRegistry,
  type DeactivationGuard,
} from './application/entitlement.service';
export { IndustryPackService } from './application/industry-pack.service';
export { INDUSTRY_PACKS, findPack } from './domain/packs';
export { buildNavigation, buildQuickCreate } from './domain/navigation';
export {
  moduleEntitlements,
  entityCapabilities,
  tenantIndustryPacks,
  configInstallEvents,
} from './infrastructure/schema';

@Module({
  imports: [AuditModule, TenancyModule, CatalogModule],
  controllers: [CapabilitiesController, EntitlementsAdminController, IndustryPacksController],
  providers: [EntitlementService, DeactivationGuardRegistry, IndustryPackService],
  exports: [EntitlementService, DeactivationGuardRegistry, IndustryPackService],
})
export class EntitlementsModule {}
