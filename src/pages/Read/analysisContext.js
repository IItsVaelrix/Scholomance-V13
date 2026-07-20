const SCOPES = new Set(['word', 'selection', 'line', 'local', 'document']);

function fail(message) {
  throw new Error(`PB-ERR-v1-VALUE: ${message}`);
}

function required(value, field) {
  if (typeof value !== 'string' || !value.trim()) fail(`${field} is required`);
  return value;
}

export function buildAnalysisContextInput({
  scope,
  surface,
  selection,
  lines,
  lineIndex,
  documentContext,
}) {
  if (!SCOPES.has(scope)) fail('invalid analysis scope');
  const target = required(surface, 'surface').trim();

  if (scope === 'word') return Object.freeze({ scope, surface: target });
  if (scope === 'selection') {
    return Object.freeze({
      scope,
      surface: target,
      selection: required(selection, 'selection'),
    });
  }

  if (!Array.isArray(lines) || !Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= lines.length) {
    fail('active line is unavailable');
  }
  const containingLine = required(lines[lineIndex], 'containingLine');
  if (scope === 'line') return Object.freeze({ scope, surface: target, containingLine });

  if (scope === 'local') {
    const before = lines
      .slice(Math.max(0, lineIndex - 2), lineIndex)
      .filter((line) => typeof line === 'string' && line.trim());
    const after = lines
      .slice(lineIndex + 1, lineIndex + 3)
      .filter((line) => typeof line === 'string' && line.trim());
    const neighboringLines = Object.freeze([...before, ...after]);
    if (neighboringLines.length === 0) fail('local neighbors are unavailable');
    return Object.freeze({ scope, surface: target, containingLine, neighboringLines });
  }

  return Object.freeze({
    scope,
    surface: target,
    documentContext: required(documentContext, 'documentContext'),
  });
}
