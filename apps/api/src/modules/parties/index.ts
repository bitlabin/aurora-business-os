import { Module } from '@nestjs/common';
import { AuditModule } from '../audit';
import { PartiesController } from './api/parties.controller';
import { PartyService } from './application/party.service';

export { PartyService } from './application/party.service';
export { parties, partyRoles, partyEntityAccounts } from './infrastructure/schema';

@Module({
  imports: [AuditModule],
  controllers: [PartiesController],
  providers: [PartyService],
  exports: [PartyService],
})
export class PartiesModule {}
