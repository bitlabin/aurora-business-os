import { Module } from '@nestjs/common';
import { AuditModule } from '../audit';
import { CompaniesController } from './api/companies.controller';
import { OrganizationService } from './application/organization.service';

export { OrganizationService, type CreateCompanyInput } from './application/organization.service';
export { companies, branches, departments } from './infrastructure/schema';

@Module({
  imports: [AuditModule],
  controllers: [CompaniesController],
  providers: [OrganizationService],
  exports: [OrganizationService],
})
export class OrganizationModule {}
