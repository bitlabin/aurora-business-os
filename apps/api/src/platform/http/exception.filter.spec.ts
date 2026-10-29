import { describe, expect, it } from 'vitest';
import { describeForLog } from './exception.filter';

describe('describeForLog', () => {
  it('withholds query parameters from driver errors', () => {
    const cause = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
      name: 'error',
    });
    const err = Object.assign(
      new Error('Failed query: insert into users ... params: $argon2id$v=19$m=19456,t=2,p=1$abc'),
      { name: 'DrizzleQueryError', cause },
    );
    const text = describeForLog(err);
    expect(text).not.toContain('argon2id');
    expect(text).not.toContain('params:');
    expect(text).toContain('23505');
    expect(text).toContain('duplicate key');
  });

  it('keeps the stack for ordinary errors', () => {
    const text = describeForLog(new TypeError('boom'));
    expect(text).toContain('TypeError: boom');
  });
});
