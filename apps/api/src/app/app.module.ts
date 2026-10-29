import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ACCESS_RESOLVER } from '../platform/auth/access-resolver';
import { SECURITY_EVENT_SINK } from '../platform/auth/security-events';
import { AuthGuard, ModuleGuard, PermissionGuard } from '../platform/auth/guards';
import { env } from '../platform/config/env';
import { DatabaseModule } from '../platform/database/database.module';
import { EventsModule } from '../platform/events/events.module';
import { ApiExceptionFilter } from '../platform/http/exception.filter';
import { AuditModule } from '../modules/audit';
import { CatalogModule } from '../modules/catalog';
import { EntitlementsModule } from '../modules/entitlements';
import { IdentityModule } from '../modules/identity';
import { InventoryModule } from '../modules/inventory';
import { OrganizationModule } from '../modules/organization';
import { PartiesModule } from '../modules/parties';
import { TenancyModule } from '../modules/tenancy';
import { CompositeAccessResolver } from './access/access-resolver';
import { AuthController } from './access/auth.controller';
import { AuditSecurityEventSink } from './access/security-event-sink';
import { HealthController } from './health.controller';
import { TenantProvisioningService } from './provisioning/tenant-provisioning.service';

/**
 * Composition root. Module order is not significant for Nest, but the list is the authoritative
 * inventory of what Phase 0 contains — nothing is registered here that is not implemented.
 */
@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: env().LOG_LEVEL,
        redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        transport:
          env().NODE_ENV === 'development'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        autoLogging: env().NODE_ENV !== 'test',
      },
    }),
    DatabaseModule,
    EventsModule,
    AuditModule,
    IdentityModule,
    TenancyModule,
    OrganizationModule,
    CatalogModule,
    EntitlementsModule,
    PartiesModule,
    InventoryModule,
  ],
  controllers: [HealthController, AuthController],
  providers: [
    CompositeAccessResolver,
    { provide: ACCESS_RESOLVER, useExisting: CompositeAccessResolver },
    AuditSecurityEventSink,
    { provide: SECURITY_EVENT_SINK, useExisting: AuditSecurityEventSink },
    TenantProvisioningService,
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    // Guard order is registration order: authenticate → module entitlement → permission/scope.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: ModuleGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
  exports: [TenantProvisioningService],
})
export class AppModule {}
