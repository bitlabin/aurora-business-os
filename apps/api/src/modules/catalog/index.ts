import { Module } from '@nestjs/common';
import { AuditModule } from '../audit';
import {
  ItemCategoriesController,
  ItemsController,
  UomsController,
} from './api/catalog.controller';
import { CatalogService } from './application/catalog.service';

export { CatalogService, DEFAULT_UOMS } from './application/catalog.service';
export {
  items,
  itemCategories,
  itemPhysicalProfiles,
  itemBarcodes,
  uoms,
} from './infrastructure/schema';

@Module({
  imports: [AuditModule],
  controllers: [ItemsController, ItemCategoriesController, UomsController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
