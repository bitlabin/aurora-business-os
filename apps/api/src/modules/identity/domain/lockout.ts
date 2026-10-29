/**
 * Account lockout policy (SEC-001). Pure so it can be unit-tested without a database.
 */
export interface LockoutPolicy {
  maxFailedAttempts: number;
  lockoutMinutes: number;
}

export interface LockoutState {
  failedLoginAttempts: number;
  lockedUntil: Date | null;
}

export function isLocked(state: LockoutState, now: Date): boolean {
  return state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime();
}

/** State after a failed attempt: increments and locks when the threshold is reached. */
export function recordFailure(state: LockoutState, policy: LockoutPolicy, now: Date): LockoutState {
  const attempts = state.failedLoginAttempts + 1;
  if (attempts >= policy.maxFailedAttempts) {
    return {
      failedLoginAttempts: attempts,
      lockedUntil: new Date(now.getTime() + policy.lockoutMinutes * 60_000),
    };
  }
  return { failedLoginAttempts: attempts, lockedUntil: null };
}

export function recordSuccess(): LockoutState {
  return { failedLoginAttempts: 0, lockedUntil: null };
}
