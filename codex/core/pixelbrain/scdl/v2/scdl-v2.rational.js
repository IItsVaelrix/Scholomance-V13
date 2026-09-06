// Exact rational arithmetic for SCDL v2 constant evaluation.
//
// Values are represented publicly as { numerator: string, denominator: string },
// always reduced to lowest terms with a strictly positive denominator, using
// base-10 integer strings so the shape stays JSON-safe across diagnostics,
// IR, bytecode, and packages. Internally, callers convert those strings to
// local BigInts to compute, then hand the result back through makeRational.

function gcd(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    [x, y] = [y, x % y];
  }
  return x;
}

export function makeRational(numerator, denominator = 1n) {
  if (denominator === 0n) throw new RangeError('rational denominator is zero');
  const sign = denominator < 0n ? -1n : 1n;
  const n = BigInt(numerator) * sign;
  const d = BigInt(denominator) * sign;
  const divisor = gcd(n < 0n ? -n : n, d);
  return Object.freeze({ numerator: (n / divisor).toString(10), denominator: (d / divisor).toString(10) });
}

export function parseRational(raw) {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(raw));
  if (!match) throw new TypeError(`invalid exact decimal '${raw}'`);
  const fraction = match[3] || '';
  const scale = 10n ** BigInt(fraction.length);
  const magnitude = BigInt(match[2]) * scale + BigInt(fraction || '0');
  return makeRational(match[1] ? -magnitude : magnitude, scale);
}

export const addRational = (a, b) => makeRational(BigInt(a.numerator) * BigInt(b.denominator) + BigInt(b.numerator) * BigInt(a.denominator), BigInt(a.denominator) * BigInt(b.denominator));
export const subRational = (a, b) => makeRational(BigInt(a.numerator) * BigInt(b.denominator) - BigInt(b.numerator) * BigInt(a.denominator), BigInt(a.denominator) * BigInt(b.denominator));
export const mulRational = (a, b) => makeRational(BigInt(a.numerator) * BigInt(b.numerator), BigInt(a.denominator) * BigInt(b.denominator));
export const divRational = (a, b) => makeRational(BigInt(a.numerator) * BigInt(b.denominator), BigInt(a.denominator) * BigInt(b.numerator));
export const rationalToString = (value) => `${value.numerator}/${value.denominator}`;
export const isIntegralRational = (value) => value.denominator === '1';
