// Arrows with an EXPRESSION body: there is no brace to match, so the
// declaration ends at its semicolon. No hand fixture had this shape, and the
// branch that handles it survived mutation unnoticed.
export const double = (n) => n * 2;

export const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

export const label = (kind) => (kind === 'const' ? 'binding' : 'callable');

export function afterwards(x) {
  return x + 1;
}
