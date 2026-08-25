// The case the paren_depth guard was ADDED for: a brace inside the parameter
// list must NOT be mistaken for the body brace. Guards against regression.
export function withOptions(input, options = {}) {
  const merged = { ...options, input };
  return merged;
}

export function withDestructuredDefault({ a = 1, b = 2 } = {}) {
  return a + b;
}
