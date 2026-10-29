/**
 * Stable API error codes (FDD §21.1). HTTP status is a transport detail; clients branch on
 * `code`.
 */
export const ERROR_CODES = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  /** Module not enabled for this tenant/company. Deliberately 404 (ADR-004). */
  MODULE_DISABLED: 404,
  CONFLICT: 409,
  VERSION_CONFLICT: 409,
  IDEMPOTENCY_KEY_REUSED: 409,
  BUSINESS_RULE: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export interface FieldError {
  path: string;
  message: string;
}

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  requestId: string;
  retryable: boolean;
  fieldErrors?: FieldError[];
  conflictVersion?: number;
}

/**
 * Error raised by domain and application code. Transport layers map `code` to HTTP status via
 * ERROR_CODES; domain code never imports a web framework.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly fieldErrors: FieldError[] | undefined;
  readonly retryable: boolean;
  readonly conflictVersion: number | undefined;

  constructor(
    code: ErrorCode,
    message: string,
    options: {
      fieldErrors?: FieldError[];
      retryable?: boolean;
      conflictVersion?: number;
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.fieldErrors = options.fieldErrors;
    this.retryable = options.retryable ?? false;
    this.conflictVersion = options.conflictVersion;
  }

  get status(): number {
    return ERROR_CODES[this.code];
  }

  static notFound(what: string): AppError {
    return new AppError('NOT_FOUND', `${what} not found`);
  }

  static forbidden(message = 'Forbidden'): AppError {
    return new AppError('FORBIDDEN', message);
  }

  static moduleDisabled(): AppError {
    // Same status as NOT_FOUND so a disabled module cannot be fingerprinted (ADR-004).
    return new AppError('MODULE_DISABLED', 'Not found');
  }

  static businessRule(message: string, fieldErrors?: FieldError[]): AppError {
    return new AppError('BUSINESS_RULE', message, fieldErrors === undefined ? {} : { fieldErrors });
  }

  static conflict(message: string): AppError {
    return new AppError('CONFLICT', message);
  }

  static versionConflict(current: number): AppError {
    return new AppError('VERSION_CONFLICT', 'The record was modified by someone else', {
      conflictVersion: current,
    });
  }

  static validation(fieldErrors: FieldError[]): AppError {
    return new AppError('VALIDATION_FAILED', 'Validation failed', { fieldErrors });
  }

  static unauthenticated(message = 'Authentication required'): AppError {
    return new AppError('UNAUTHENTICATED', message);
  }
}
