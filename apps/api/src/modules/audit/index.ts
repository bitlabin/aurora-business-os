import { Module } from '@nestjs/common';
import { AuditController } from './api/audit.controller';
import { AuditService } from './application/audit.service';

export { AuditService, type AuditEntry } from './application/audit.service';
export { auditEvents } from './infrastructure/schema';

@Module({
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
