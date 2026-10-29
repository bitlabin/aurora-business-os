import type { RequestContext } from './request-context';

/**
 * Port implemented by the composition root (apps/api/src/app/access-resolver.ts) using the
 * identity, tenancy and entitlements modules. Keeps the platform layer free of module
 * dependencies.
 */
export interface AccessResolver {
  /**
   * Resolve an opaque session token into a full request context. Returns null when the token
   * is unknown, expired or revoked. `companyId` is the client's requested company (header),
   * which the implementation must verify against scope grants before accepting.
   */
  resolve(input: {
    token: string;
    requestId: string;
    companyId: string | undefined;
    ip: string | undefined;
    userAgent: string | undefined;
  }): Promise<RequestContext | null>;
}

export const ACCESS_RESOLVER = Symbol('ACCESS_RESOLVER');
