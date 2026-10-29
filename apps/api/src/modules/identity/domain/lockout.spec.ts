import { describe, expect, it } from 'vitest';
import { isLocked, recordFailure, recordSuccess } from './lockout';

const policy = { maxFailedAttempts: 3, lockoutMinutes: 15 };
const now = new Date('2026-10-29T10:00:00Z');

describe('lockout policy', () => {
  it('locks on the Nth failure and stays locked until the window passes', () => {
    let s = { failedLoginAttempts: 0, lockedUntil: null as Date | null };
    s = recordFailure(s, policy, now);
    s = recordFailure(s, policy, now);
    expect(isLocked(s, now)).toBe(false);
    s = recordFailure(s, policy, now);
    expect(isLocked(s, now)).toBe(true);
    expect(isLocked(s, new Date(now.getTime() + 16 * 60_000))).toBe(false);
  });

  it('a successful login clears the counter', () => {
    expect(recordSuccess()).toEqual({ failedLoginAttempts: 0, lockedUntil: null });
  });
});
