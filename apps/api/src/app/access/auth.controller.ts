import { Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppError, type SessionInfo, loginRequestSchema } from '@aurora/types';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { SESSION_COOKIE } from '../../platform/auth/guards';
import {
  CompanyScoped,
  Ctx,
  Public,
  type RequestContext,
} from '../../platform/auth/request-context';
import { ZodBody } from '../../platform/http/zod';
import { AuditService } from '../../modules/audit';
import { IdentityService } from '../../modules/identity';
import { OrganizationService } from '../../modules/organization';
import { TenancyService } from '../../modules/tenancy';
import { UnitOfWork } from '../../platform/database/unit-of-work';
import { env } from '../../platform/config/env';

type LoginResponse =
  | {
      status: 'ok';
      token: string;
      expiresAt: string;
      tenant: { id: string; slug: string; name: string };
    }
  | { status: 'tenant_required'; tenants: { id: string; slug: string; name: string }[] };

@ApiTags('auth')
@Controller('auth')
@CompanyScoped(false)
export class AuthController {
  constructor(
    private readonly identity: IdentityService,
    private readonly tenancy: TenancyService,
    private readonly organization: OrganizationService,
    private readonly audit: AuditService,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * Password login. A session is always bound to one tenant: when the user belongs to several
   * and names none, the tenants are returned so the client can ask.
   */
  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @ZodBody(loginRequestSchema) body: z.infer<typeof loginRequestSchema>,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LoginResponse> {
    const user = await this.identity.authenticate(body.email, body.password);
    const memberships = await this.tenancy.listMembershipsForUser(user.id);
    let target = memberships.find(
      (m) => body.tenantSlug === undefined || m.tenant.slug === body.tenantSlug,
    );
    if (body.tenantSlug === undefined && memberships.length > 1) target = undefined;
    if (!target) {
      if (body.tenantSlug !== undefined || memberships.length === 0) {
        // Same message as a wrong password: do not reveal which tenants exist.
        throw AppError.unauthenticated('Invalid email or password');
      }
      return {
        status: 'tenant_required',
        tenants: memberships.map((m) => ({
          id: m.tenant.id,
          slug: m.tenant.slug,
          name: m.tenant.name,
        })),
      };
    }

    const client = { ip: request.ip, userAgent: headerValue(request, 'user-agent') };
    const session = await this.identity.createSession({
      userId: user.id,
      tenantId: target.tenant.id,
      client,
    });
    await this.uow.run({ tenantId: target.tenant.id, userId: user.id, requestId: request.id }, () =>
      this.audit.record({
        tenantId: target.tenant.id,
        actorUserId: user.id,
        action: 'auth.login',
        subjectType: 'user',
        subjectId: user.id,
        ip: client.ip,
        userAgent: client.userAgent,
        sensitive: true,
      }),
    );
    void reply.setCookie(SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: env().NODE_ENV === 'production',
      path: '/',
      expires: new Date(session.expiresAt),
    });
    return {
      status: 'ok',
      token: session.token,
      expiresAt: session.expiresAt,
      tenant: { id: target.tenant.id, slug: target.tenant.slug, name: target.tenant.name },
    };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(
    @Ctx() ctx: RequestContext,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ ok: true }> {
    await this.identity.revokeSession(ctx.sessionId, 'logout');
    await this.uow.run(
      { tenantId: ctx.tenant.id, userId: ctx.user.id, requestId: ctx.requestId },
      () =>
        this.audit.record({
          tenantId: ctx.tenant.id,
          actorUserId: ctx.user.id,
          action: 'auth.logout',
          subjectType: 'user',
          subjectId: ctx.user.id,
          sensitive: true,
        }),
    );
    void reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Post('logout-all')
  @HttpCode(200)
  async logoutAll(
    @Ctx() ctx: RequestContext,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ revoked: number }> {
    const revoked = await this.identity.revokeAllSessions(ctx.user.id, 'logout-all');
    await this.uow.run(
      { tenantId: ctx.tenant.id, userId: ctx.user.id, requestId: ctx.requestId },
      () =>
        this.audit.record({
          tenantId: ctx.tenant.id,
          actorUserId: ctx.user.id,
          action: 'auth.logout_all',
          subjectType: 'user',
          subjectId: ctx.user.id,
          after: { revoked },
          sensitive: true,
        }),
    );
    void reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { revoked };
  }

  @Get('me')
  async me(@Ctx() ctx: RequestContext): Promise<SessionInfo> {
    const companies = await this.organization.listCompanies(ctx.tenant.id, ctx.companyScopes);
    return {
      user: {
        id: ctx.user.id,
        email: ctx.user.email,
        displayName: ctx.user.displayName,
        locale: ctx.user.locale,
      },
      tenant: ctx.tenant,
      companies,
      expiresAt: ctx.sessionExpiresAt,
    };
  }
}

function headerValue(request: FastifyRequest, name: string): string | undefined {
  const v = request.headers[name];
  return Array.isArray(v) ? v[0] : v;
}
