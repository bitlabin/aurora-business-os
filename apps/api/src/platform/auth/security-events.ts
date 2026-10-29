import type { RequestContext } from './request-context';

/**
 * Port for recording security-relevant denials (T-002: a denied export attempt leaves an audit
 * event). Implemented in the composition root with the audit module so the platform layer stays
 * free of module dependencies.
 */
export interface SecurityEventSink {
  denied(
    ctx: RequestContext,
    event: { action: string; resource: string; reason: string },
  ): Promise<void>;
}

export const SECURITY_EVENT_SINK = Symbol('SECURITY_EVENT_SINK');
