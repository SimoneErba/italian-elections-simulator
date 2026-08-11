export type Fraction = {
  numerator: bigint;
  denominator: bigint;
};

export function fraction(numerator: bigint | number, denominator: bigint | number = 1n): Fraction {
  const rawNumerator = BigInt(numerator);
  const rawDenominator = BigInt(denominator);
  if (rawDenominator === 0n) throw new Error("Fraction denominator cannot be zero");

  const sign = rawDenominator < 0n ? -1n : 1n;
  const divisor = gcd(abs(rawNumerator), abs(rawDenominator));
  return {
    numerator: (rawNumerator * sign) / divisor,
    denominator: (rawDenominator * sign) / divisor
  };
}

export function compareFractions(a: Fraction, b: Fraction): number {
  const left = a.numerator * b.denominator;
  const right = b.numerator * a.denominator;
  return left === right ? 0 : left > right ? 1 : -1;
}

export function percentage(part: bigint, total: bigint): Fraction {
  return total === 0n ? fraction(0n) : fraction(part * 100n, total);
}

export function formatPercent(value: Fraction, decimals = 2): string {
  const scale = 10n ** BigInt(decimals);
  const scaled = (value.numerator * scale) / value.denominator;
  const whole = scaled / scale;
  const decimal = (scaled % scale).toString().padStart(decimals, "0");
  return `${whole}.${decimal}%`;
}

export function formatBigInt(value: bigint): string {
  return new Intl.NumberFormat("it-IT").format(value);
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a;
  let y = b;
  while (y !== 0n) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x === 0n ? 1n : x;
}
