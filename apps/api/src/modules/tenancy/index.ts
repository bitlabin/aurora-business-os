import { Module } from '@nestjs/common';
import { AuditModule } from '../audit';
import { TenancyAdminController } from './api/admin.controller';
import { TenancyService } from './application/tenancy.service';

export {
  TenancyService,
  type TenantRecord,
  type ResolvedAccess,
} from './application/tenancy.service';
export {
  tenants,
  memberships,
  roles,
  rolePermissions,
  membershipRoles,
  userScopeGrants,
} from './infrastructure/schema';

@Module({
  imports: [AuditModule],
  controllers: [TenancyAdminController],
  providers: [TenancyService],
  exports: [TenancyService],
})
export class TenancyModule {}
