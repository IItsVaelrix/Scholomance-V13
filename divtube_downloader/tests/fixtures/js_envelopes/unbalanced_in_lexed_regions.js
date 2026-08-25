// UNBALANCED braces inside strings, templates and regex literals. Every
// hand-written fixture had balanced braces, so a lexer that mis-classified a
// region still landed on the right envelope and the bug cancelled itself out.
// These do not cancel: count a brace in here and the envelope moves.
export function openers(rows) {
  const a = '{{{';
  const b = "}}";
  const c = `${rows.length} {{{{`;
  const d = /\{\{\{/g;
  return [a, b, c, d];
}

export const CLOSERS = Object.freeze({
  one: '}}}',
  two: `}}}}${'}'}`,
  three: "{{",
});

export function afterUnbalanced() {
  return 'still here';
}
