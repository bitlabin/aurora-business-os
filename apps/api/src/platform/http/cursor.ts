import { AppError } from '@aurora/types';

/**
 * Opaque keyset cursors (FDD §21.1: no OFFSET on large tables). Phase 0 lists are ordered by
 * time-ordered UUID v7 primary keys, so the cursor is simply the last id, base64url-encoded.
 */
export function encodeCursor(lastId: string): string {
  return Buffer.from(lastId, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string | undefined): string | undefined {
  if (cursor === undefined) return undefined;
  const value = Buffer.from(cursor, 'base64url').toString('utf8');
  if (!/^[0-9a-f-]{36}$/.test(value))
    throw AppError.validation([{ path: 'cursor', message: 'Invalid cursor' }]);
  return value;
}

export function page<T extends { id: string }>(
  rows: T[],
  limit: number,
): { items: T[]; nextCursor: string | null } {
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return { items, nextCursor: rows.length > limit && last ? encodeCursor(last.id) : null };
}
