import { Module } from '@nestjs/common';
import { IdentityService } from './application/identity.service';
import { PasswordHasher } from './infrastructure/password-hasher';
import { SessionTokenService } from './infrastructure/session-token';

export {
  IdentityService,
  type UserRecord,
  type ResolvedSession,
  type ClientInfo,
} from './application/identity.service';
export { users, sessions } from './infrastructure/schema';

/**
 * Identity has no controllers of its own: login/logout/me are exposed by the access
 * composition (src/app/access) because a session is always created *for a tenant*.
 */
@Module({
  providers: [IdentityService, PasswordHasher, SessionTokenService],
  exports: [IdentityService],
})
export class IdentityModule {}
