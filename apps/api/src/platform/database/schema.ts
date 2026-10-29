/**
 * Aggregated schema for drizzle-kit and the typed database client. Each module owns its tables
 * (ADR-002); this file only re-exports them. Keep it in sync when a module adds a schema file.
 */
export * from '../../modules/identity/infrastructure/schema';
export * from '../../modules/tenancy/infrastructure/schema';
export * from '../../modules/organization/infrastructure/schema';
export * from '../../modules/audit/infrastructure/schema';
export * from '../events/schema';
export * from '../../modules/entitlements/infrastructure/schema';
export * from '../../modules/parties/infrastructure/schema';
export * from '../../modules/catalog/infrastructure/schema';
export * from '../../modules/inventory/infrastructure/schema';
