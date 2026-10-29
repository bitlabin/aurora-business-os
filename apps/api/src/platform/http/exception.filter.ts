import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { AppError, type ApiErrorBody, type ErrorCode } from '@aurora/types';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Every error leaves the API in the FDD §21.1 shape: code, message, fieldErrors, requestId,
 * retryable, conflictVersion. Unknown errors are logged with the request id and returned as a
 * generic 500 — internals never leak to clients.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const reply = http.getResponse<FastifyReply>();
    const request = http.getRequest<FastifyRequest>();
    const requestId = request.id;

    const body = this.toBody(exception, requestId);
    if (body.code === 'INTERNAL') {
      this.logger.error(`request ${requestId} failed: ${describeForLog(exception)}`);
    }
    void reply.status(this.statusOf(exception, body.code)).send(body);
  }

  private toBody(exception: unknown, requestId: string): ApiErrorBody {
    if (exception instanceof AppError) {
      const body: ApiErrorBody = {
        code: exception.code,
        message: exception.message,
        requestId,
        retryable: exception.retryable,
      };
      if (exception.fieldErrors) body.fieldErrors = exception.fieldErrors;
      if (exception.conflictVersion !== undefined) body.conflictVersion = exception.conflictVersion;
      return body;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = mapHttpStatus(status);
      return {
        code,
        message: code === 'INTERNAL' ? 'Internal error' : exception.message,
        requestId,
        retryable: false,
      };
    }
    return { code: 'INTERNAL', message: 'Internal error', requestId, retryable: false };
  }

  private statusOf(exception: unknown, code: ErrorCode): number {
    if (exception instanceof AppError) return exception.status;
    if (exception instanceof HttpException) return exception.getStatus();
    return code === 'INTERNAL' ? 500 : 400;
  }
}

function mapHttpStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
      return 'VALIDATION_FAILED';
    case 401:
      return 'UNAUTHENTICATED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 422:
      return 'BUSINESS_RULE';
    case 429:
      return 'RATE_LIMITED';
    default:
      return 'INTERNAL';
  }
}

/**
 * Safe description for logs. Database driver errors embed the failed SQL *and its parameters*
 * in their message (e.g. drizzle's "Failed query: … params: …"), which could include password
 * or token hashes. Only the error class, a sanitised message and the cause's class/code are
 * logged — never query parameters, never the stack of a driver error.
 */
export function describeForLog(exception: unknown): string {
  if (!(exception instanceof Error)) return String(exception);
  const cause = (exception as Error & { cause?: unknown }).cause;
  const isDriverError =
    exception.name === 'DrizzleQueryError' || /params:/i.test(exception.message);
  if (isDriverError) {
    const causeInfo =
      cause instanceof Error
        ? ` cause=${cause.name}${'code' in cause ? `(${String((cause as { code?: unknown }).code)})` : ''}: ${cause.message}`
        : '';
    return `${exception.name}: database query failed (query and parameters withheld from logs)${causeInfo}`;
  }
  return exception.stack ?? `${exception.name}: ${exception.message}`;
}
