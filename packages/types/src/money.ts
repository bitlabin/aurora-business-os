import Decimal from 'decimal.js';

/**
 * Exact-decimal money and quantity primitives (FDD §16.1, FA-001).
 *
 * - Backed by decimal.js; never IEEE 754 floats.
 * - Serialized as decimal strings in APIs and stored as NUMERIC(20,6) in PostgreSQL.
 * - Immutable value objects; every operation returns a new instance.
 * - Currency-aware: arithmetic across currencies throws (FX is an explicit, policy-driven
 *   conversion, never an implicit coercion).
 */

const DecimalCtor = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN });

export type RoundingMode = 'HALF_EVEN' | 'HALF_UP' | 'DOWN' | 'UP';

const ROUNDING: Record<RoundingMode, Decimal.Rounding> = {
  HALF_EVEN: Decimal.ROUND_HALF_EVEN,
  HALF_UP: Decimal.ROUND_HALF_UP,
  DOWN: Decimal.ROUND_DOWN,
  UP: Decimal.ROUND_UP,
};

/** ISO 4217 currency code, upper-case, three letters. */
export type CurrencyCode = string & { readonly __currency?: never };

const CURRENCY_RE = /^[A-Z]{3}$/;
const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

/** Minor units for currencies that are not 2-decimal. Extend via `registerCurrencyMinorUnits`. */
const MINOR_UNITS = new Map<string, number>([
  ['JPY', 0],
  ['KRW', 0],
  ['IQD', 3],
  ['KWD', 3],
  ['BHD', 3],
  ['JOD', 3],
  ['OMR', 3],
  ['TND', 3],
  ['LYD', 3],
]);

export function registerCurrencyMinorUnits(code: string, minorUnits: number): void {
  assertCurrency(code);
  if (!Number.isInteger(minorUnits) || minorUnits < 0 || minorUnits > 6) {
    throw new RangeError(`minorUnits must be an integer 0..6, got ${minorUnits}`);
  }
  MINOR_UNITS.set(code, minorUnits);
}

export function currencyMinorUnits(code: string): number {
  assertCurrency(code);
  return MINOR_UNITS.get(code) ?? 2;
}

export function assertCurrency(code: string): asserts code is CurrencyCode {
  if (!CURRENCY_RE.test(code)) {
    throw new TypeError(`Invalid currency code: ${code}`);
  }
}

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

function toDecimal(value: string | number | Decimal): Decimal {
  if (Decimal.isDecimal(value)) {
    return new DecimalCtor(value.toString());
  }
  if (typeof value === 'number') {
    // Numbers are accepted only when they are exactly representable integers (e.g. counts).
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new MoneyError(
        `Non-integer JavaScript numbers are not accepted for money/quantity (${value}); pass a decimal string`,
      );
    }
    return new DecimalCtor(value);
  }
  if (!DECIMAL_RE.test(value.trim())) {
    throw new MoneyError(`Invalid decimal string: "${value}"`);
  }
  return new DecimalCtor(value.trim());
}

/** Internal storage scale shared with the database column NUMERIC(20,6). */
export const STORAGE_SCALE = 6;

export class Money {
  private constructor(
    private readonly value: Decimal,
    readonly currency: CurrencyCode,
  ) {}

  static of(amount: string | number | Decimal, currency: string): Money {
    assertCurrency(currency);
    return new Money(toDecimal(amount), currency);
  }

  static zero(currency: string): Money {
    return Money.of('0', currency);
  }

  /** Parse an API/DB decimal string; throws on malformed input. */
  static parse(amount: string, currency: string): Money {
    return Money.of(amount, currency);
  }

  get amount(): string {
    return this.value.toFixed(STORAGE_SCALE);
  }

  /** Amount rounded to the currency's minor units; use for presentation and posting. */
  get amountRounded(): string {
    return this.round().value.toFixed(currencyMinorUnits(this.currency));
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isNegative(): boolean {
    return this.value.isNegative();
  }

  isPositive(): boolean {
    return this.value.gt(0);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.value.plus(other.value), this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.value.minus(other.value), this.currency);
  }

  multiply(factor: string | number | Decimal | Quantity): Money {
    const f = factor instanceof Quantity ? toDecimal(factor.toString()) : toDecimal(factor);
    return new Money(this.value.times(f), this.currency);
  }

  /** Divide with full internal precision; round explicitly afterwards. */
  divide(divisor: string | number | Decimal): Money {
    const d = toDecimal(divisor);
    if (d.isZero()) {
      throw new MoneyError('Division by zero');
    }
    return new Money(this.value.div(d), this.currency);
  }

  negate(): Money {
    return new Money(this.value.negated(), this.currency);
  }

  abs(): Money {
    return new Money(this.value.abs(), this.currency);
  }

  /** Round to the currency's minor units (default) or an explicit scale. */
  round(mode: RoundingMode = 'HALF_EVEN', scale?: number): Money {
    const s = scale ?? currencyMinorUnits(this.currency);
    return new Money(this.value.toDecimalPlaces(s, ROUNDING[mode]), this.currency);
  }

  /**
   * Allocate this amount across weights without losing or creating a minor unit
   * (largest-remainder method). Sum of the parts always equals the rounded original.
   */
  allocate(weights: readonly (string | number)[], mode: RoundingMode = 'HALF_EVEN'): Money[] {
    if (weights.length === 0) {
      throw new MoneyError('allocate requires at least one weight');
    }
    const scale = currencyMinorUnits(this.currency);
    const total = this.round(mode, scale).value;
    const ws = weights.map((w) => toDecimal(w));
    const sumW = ws.reduce((a, b) => a.plus(b), new DecimalCtor(0));
    if (sumW.lte(0)) {
      throw new MoneyError('allocate requires positive weights');
    }
    const unit = new DecimalCtor(10).pow(-scale);
    const parts = ws.map((w) =>
      total.times(w).div(sumW).toDecimalPlaces(scale, Decimal.ROUND_DOWN),
    );
    let remainder = total.minus(parts.reduce((a, b) => a.plus(b), new DecimalCtor(0)));
    // distribute leftover minor units to the largest fractional remainders first
    const order = ws
      .map((w, i) => ({
        i,
        frac: total
          .times(w)
          .div(sumW)
          .minus(parts[i] ?? 0),
      }))
      .sort((a, b) => b.frac.comparedTo(a.frac));
    let k = 0;
    while (remainder.gt(0) && k < order.length) {
      const idx = order[k]?.i ?? 0;
      parts[idx] = (parts[idx] ?? new DecimalCtor(0)).plus(unit);
      remainder = remainder.minus(unit);
      k += 1;
    }
    return parts.map((p) => new Money(p, this.currency));
  }

  compareTo(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other);
    return this.value.comparedTo(other.value) as -1 | 0 | 1;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.value.eq(other.value);
  }

  toJSON(): { amount: string; currency: string } {
    return { amount: this.amount, currency: this.currency };
  }

  toString(): string {
    return `${this.amount} ${this.currency}`;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new MoneyError(`Currency mismatch: ${this.currency} vs ${other.currency}`);
    }
  }
}

export class Quantity {
  private constructor(private readonly value: Decimal) {}

  static of(amount: string | number | Decimal): Quantity {
    return new Quantity(toDecimal(amount));
  }

  static zero(): Quantity {
    return new Quantity(new DecimalCtor(0));
  }

  toString(): string {
    return this.value.toFixed(STORAGE_SCALE);
  }

  toJSON(): string {
    return this.toString();
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isNegative(): boolean {
    return this.value.isNegative();
  }

  add(other: Quantity): Quantity {
    return new Quantity(this.value.plus(other.value));
  }

  subtract(other: Quantity): Quantity {
    return new Quantity(this.value.minus(other.value));
  }

  multiply(factor: string | number | Decimal): Quantity {
    return new Quantity(this.value.times(toDecimal(factor)));
  }

  compareTo(other: Quantity): -1 | 0 | 1 {
    return this.value.comparedTo(other.value) as -1 | 0 | 1;
  }

  equals(other: Quantity): boolean {
    return this.value.eq(other.value);
  }
}

/** Sum a list of Money values of one currency; empty list needs an explicit currency. */
export function sumMoney(values: readonly Money[], currency?: string): Money {
  if (values.length === 0) {
    if (currency === undefined) {
      throw new MoneyError('sumMoney of an empty list requires a currency');
    }
    return Money.zero(currency);
  }
  return values.reduce((acc, v) => acc.add(v));
}
