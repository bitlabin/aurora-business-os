import { Body, Param, type PipeTransform, Query } from '@nestjs/common';
import { AppError, type FieldError } from '@aurora/types';
import type { z } from 'zod';

/**
 * Zod is the single validation and contract layer (ADR-002). A schema from @aurora/types
 * validates the request here, types the handler, and documents the OpenAPI operation.
 */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const fieldErrors: FieldError[] = result.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.') || '(root)',
        message: issue.message,
      }));
      throw AppError.validation(fieldErrors);
    }
    return result.data;
  }
}

export const ZodBody = (schema: z.ZodType): ParameterDecorator =>
  Body(new ZodValidationPipe(schema));
export const ZodQuery = (schema: z.ZodType): ParameterDecorator =>
  Query(new ZodValidationPipe(schema));
export const ZodParam = (name: string, schema: z.ZodType): ParameterDecorator =>
  Param(name, new ZodValidationPipe(schema));
