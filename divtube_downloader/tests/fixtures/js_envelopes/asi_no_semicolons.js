// Automatic semicolon insertion: no repo file currently omits its semicolons,
// so the fallback that ends a declaration at the next top-level construct is
// unexercised by the corpus. Kept honest with a fixture rather than an opinion.
export const FIRST = Object.freeze({
  alpha: 1,
  beta: 2
})

export const SECOND = Object.freeze({
  gamma: 3
})

export function third() {
  return FIRST
}
