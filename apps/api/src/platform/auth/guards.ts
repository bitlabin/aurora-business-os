import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppError, type ModuleKey, type PermissionKey } from '@aurora/types';
import { ACCESS_RESOLVER, type AccessResolver } from './access-resolver';
import { SECURITY_EVENT_SINK, type SecurityEventSink } from './security-events';
import {
  type AuthedRequest,
  COMPANY_SCOPED_KEY,
  IS_PUBLIC,
  MODULE_KEY,
  PERMISSION_KEY,
} from './request-context';

export const SESSION_COOKIE = 'aurora_session';

function extractToken(request: AuthedRequest): string | undefined {
  const header = request.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }
  return request.cookies[SESSION_COOKIE];
}

function headerValue(request: AuthedRequest, name: string): string | undefined {
  const v = request.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Global guard 1/3: authenticate and build the RequestContext. Public routes skip it.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ACCESS_RESOLVER) private readonly resolver: AccessResolver,
  ) {}

  async canActivate(host: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      host.getHandler(),
      host.getClass(),
    ]);
    if (isPublic) return true;

    const request = host.switchToHttp().getRequest<AuthedRequest>();
    const token = extractToken(request);
    if (!token) throw AppError.unauthenticated();

    const ctx = await this.resolver.resolve({
      token,
      requestId: request.id,
      companyId: headerValue(request, 'x-company-id'),
      ip: request.ip,
      userAgent: headerValue(request, 'user-agent'),
    });
    if (!ctx) throw AppError.unauthenticated('Session is invalid or expired');
    request.ctx = ctx;
    return true;
  }
}

/**
 * Global guard 2/3: module entitlement. Runs before permission so a disabled module answers
 * 404 MODULE_DISABLED regardless of the caller's permissions (ADR-004, MI-004).
 */
@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(host: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<ModuleKey | undefined>(MODULE_KEY, [
      host.getHandler(),
      host.getClass(),
    ]);
    if (!required) return true;
    const { ctx } = host.switchToHttp().getRequest<AuthedRequest>();
    if (!ctx) return true; // public route; nothing to gate
    if (!ctx.modules.has(required)) throw AppError.moduleDisabled();
    return true;
  }
}

/**
 * Global guard 3/3: permission + company scope. A company-scoped route without a verified
 * X-Company-Id is rejected; permissions are evaluated against the server-built set.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(SECURITY_EVENT_SINK) private readonly securityEvents: SecurityEventSink,
  ) {}

  async canActivate(host: ExecutionContext): Promise<boolean> {
    const request = host.switchToHttp().getRequest<AuthedRequest>();
    const { ctx } = request;
    if (!ctx) return true; // public route

    const resource = `${request.method} ${request.routeOptions.url ?? request.url}`;
    const companyScoped =
      this.reflector.getAllAndOverride<boolean | undefined>(COMPANY_SCOPED_KEY, [
        host.getHandler(),
        host.getClass(),
      ]) ?? true;
    if (companyScoped && ctx.companyId === undefined) {
      await this.securityEvents.denied(ctx, {
        action: 'access.denied',
        resource,
        reason: 'company scope missing or not granted',
      });
      throw AppError.forbidden(
        'A company context (X-Company-Id) you are authorized for is required',
      );
    }

    const required =
      this.reflector.getAllAndOverride<PermissionKey[] | undefined>(PERMISSION_KEY, [
        host.getHandler(),
        host.getClass(),
      ]) ?? [];
    for (const permission of required) {
      if (!ctx.permissions.has(permission)) {
        await this.securityEvents.denied(ctx, {
          action: 'access.denied',
          resource,
          reason: `missing permission ${permission}`,
        });
        throw AppError.forbidden(`Missing permission ${permission}`);
      }
    }
    return true;
  }
}
