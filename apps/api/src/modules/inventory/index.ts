import { Module } from '@nestjs/common';
import { AuditModule } from '../audit';
import { WarehousesController } from './api/warehouses.controller';
import { WarehouseService } from './application/warehouse.service';

export { WarehouseService } from './application/warehouse.service';
export { warehouses } from './infrastructure/schema';

@Module({
  imports: [AuditModule],
  controllers: [WarehousesController],
  providers: [WarehouseService],
  exports: [WarehouseService],
})
export class InventoryModule {}
