export function renderBlock(name, rows) {
  const head = `${name} {
    opening brace inside a template literal
  }`;
  const cleaned = head.replace(/\{[^}]*\}/g, '');
  return { head, cleaned, rows };
}

export const SPLITTER = /^\s*\{(?<body>.*)\}\s*$/u;
