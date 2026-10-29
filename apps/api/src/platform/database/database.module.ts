import { Global, Module } from '@nestjs/common';
import { ENV, loadEnv } from '../config/env';
import { DatabaseService } from './database.service';
import { UnitOfWork } from './unit-of-work';

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => loadEnv() }, DatabaseService, UnitOfWork],
  exports: [ENV, DatabaseService, UnitOfWork],
})
export class DatabaseModule {}
