import { describe, expect, it } from 'vitest';
import { redact } from './audit.service';

describe('audit redaction (SEC-005)', () => {
  it('masks credential-like keys case-insensitively, including nested objects and arrays', () => {
    const out = redact({
      email: 'a@b.c',
      currentPassword: 'x',
      sessionToken: 'y',
      nested: { apiKey: 'z', mfaSecret: 'q', keep: 1 },
      list: [{ password_hash: 'h', ok: true }],
    });
    expect(out).toEqual({
      email: 'a@b.c',
      currentPassword: '[REDACTED]',
      sessionToken: '[REDACTED]',
      nested: { apiKey: '[REDACTED]', mfaSecret: '[REDACTED]', keep: 1 },
      list: [{ password_hash: '[REDACTED]', ok: true }],
    });
  });

  it('returns null for empty input', () => {
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeNull();
  });
});
