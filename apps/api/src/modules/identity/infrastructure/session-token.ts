import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../../../platform/config/env';

/**
 * Opaque session tokens: 256 random bits, base64url. Only an HMAC-SHA256 of the token is
 * stored, so a database leak does not yield usable sessions (ADR-003).
 */
@Injectable()
export class SessionTokenService {
  constructor(@Inject(ENV) private readonly env: Env) {}

  generate(): string {
    return randomBytes(32).toString('base64url');
  }

  hash(token: string): string {
    return createHmac('sha256', this.env.SESSION_SECRET).update(token).digest('base64url');
  }

  equals(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  }
}
