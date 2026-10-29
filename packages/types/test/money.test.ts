import { describe, expect, it } from 'vitest';
import { Money, MoneyError, Quantity, sumMoney, currencyMinorUnits } from '../src/money';

describe('Money', () => {
  it('keeps exact decimal values that floats cannot represent', () => {
    const a = Money.of('0.1', 'USD').add(Money.of('0.2', 'USD'));
    expect(a.amount).toBe('0.300000');
    expect(a.equals(Money.of('0.3', 'USD'))).toBe(true);
  });

  it('rejects non-integer JavaScript numbers to prevent float contamination', () => {
    expect(() => Money.of(0.1, 'USD')).toThrow(MoneyError);
    expect(Money.of(5, 'USD').amount).toBe('5.000000');
  });

  it('rejects malformed decimal strings and currencies', () => {
    expect(() => Money.of('1,000', 'USD')).toThrow(MoneyError);
    expect(() => Money.of('abc', 'USD')).toThrow(MoneyError);
    expect(() => Money.of('1', 'usd')).toThrow(TypeError);
  });

  it('refuses cross-currency arithmetic', () => {
    expect(() => Money.of('1', 'USD').add(Money.of('1', 'IQD'))).toThrow(/Currency mismatch/);
  });

  it('rounds to currency minor units with banker rounding by default', () => {
    expect(currencyMinorUnits('IQD')).toBe(3);
    expect(currencyMinorUnits('JPY')).toBe(0);
    expect(Money.of('2.345', 'USD').amountRounded).toBe('2.34'); // half-even
    expect(Money.of('2.355', 'USD').amountRounded).toBe('2.36');
    expect(Money.of('2.345', 'USD').round('HALF_UP').amountRounded).toBe('2.35');
    expect(Money.of('1250.0005', 'IQD').amountRounded).toBe('1250.000');
  });

  it('allocates without creating or losing a minor unit', () => {
    const parts = Money.of('100.00', 'USD').allocate([1, 1, 1]);
    expect(parts.map((p) => p.amountRounded)).toEqual(['33.34', '33.33', '33.33']);
    expect(sumMoney(parts).amountRounded).toBe('100.00');

    const weighted = Money.of('0.05', 'USD').allocate([70, 30]);
    expect(weighted.map((p) => p.amountRounded)).toEqual(['0.04', '0.01']);
  });

  it('multiplies by quantities and divides with full precision', () => {
    const line = Money.of('19.99', 'USD').multiply(Quantity.of('3'));
    expect(line.amount).toBe('59.970000');
    expect(Money.of('10', 'USD').divide('3').round().amountRounded).toBe('3.33');
    expect(() => Money.of('10', 'USD').divide('0')).toThrow(/Division by zero/);
  });

  it('serializes as decimal strings, never numbers', () => {
    expect(JSON.parse(JSON.stringify(Money.of('1.5', 'USD')))).toEqual({
      amount: '1.500000',
      currency: 'USD',
    });
    expect(JSON.parse(JSON.stringify({ q: Quantity.of('2.5') }))).toEqual({ q: '2.500000' });
  });

  it('sumMoney needs a currency for an empty list', () => {
    expect(() => sumMoney([])).toThrow(MoneyError);
    expect(sumMoney([], 'EUR').isZero()).toBe(true);
  });
});
