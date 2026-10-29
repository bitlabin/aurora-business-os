/**
 * Provider-neutral connector contract (ADR-008, F-API-002). Phase 0 ships the contract only;
 * no adapter is implemented. Every adapter (e-commerce, POS, payments, bank feeds) implements
 * this interface so core tables never depend on a provider.
 */
export interface ExternalIdMapping {
  externalType: string;
  externalId: string;
  internalId: string;
}

export interface InboundEvent<T = unknown> {
  providerEventId: string;
  type: string;
  occurredAt: string;
  payload: T;
  signature?: string;
}

export interface ConnectorHealth {
  status: 'connected' | 'degraded' | 'disconnected';
  lastSuccessAt: string | null;
  pending: number;
  deadLettered: number;
  lastError: string | null;
}

export interface ReconcileResult {
  checked: number;
  backfilled: number;
  conflicts: { externalType: string; externalId: string; reason: string }[];
  nextCursor: string | null;
}

export interface Connector {
  readonly provider: string;
  connect(input: { connectionId: string; credentialsRef: string }): Promise<void>;
  mapExternalIds(mappings: readonly ExternalIdMapping[]): Promise<void>;
  verifyEvent(raw: { headers: Record<string, string>; body: string }): Promise<InboundEvent>;
  ingest(event: InboundEvent): Promise<{ effect: 'applied' | 'duplicate' | 'ignored' }>;
  publish(input: { objectType: string; internalId: string }): Promise<void>;
  reconcile(input: { cursor: string | null }): Promise<ReconcileResult>;
  health(): Promise<ConnectorHealth>;
  disconnect(): Promise<void>;
}
