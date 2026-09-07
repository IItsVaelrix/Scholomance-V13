import { parseSCDLV2 } from './scdl-v2.parser.js';
import { getSCDLV2Opcode } from './scdl-v2.opcodes.js';

const HEADER_KINDS = new Set(['VersionDeclaration', 'AssetDeclaration', 'CanvasDeclaration', 'BudgetDeclaration']);
const BINDING_KINDS = new Set([
  'ConstDeclaration', 'ShapeDeclaration', 'ShapeBlockDeclaration',
  'MaskDeclaration', 'AnchorDeclaration', 'AssertDeclaration',
  'FnDeclaration', 'SequenceDeclaration', 'RngDeclaration',
]);

function declarationCategory(kind) {
  if (HEADER_KINDS.has(kind)) return 'HEADER';
  if (BINDING_KINDS.has(kind)) return 'BINDING';
  if (kind === 'LayerDeclaration') return 'LAYER';
  return 'OTHER';
}

function canonicalInteger(raw) {
  const value = BigInt(raw);
  return value === 0n ? '0' : value.toString(10);
}

function canonicalDecimal(raw) {
  const negative = raw.startsWith('-');
  const [wholeRaw, fractionRaw] = (negative ? raw.slice(1) : raw).split('.');
  const whole = BigInt(wholeRaw).toString(10);
  const fraction = fractionRaw.replace(/0+$/, '') || '0';
  const isZero = whole === '0' && fraction === '0';
  return `${negative && !isZero ? '-' : ''}${whole}.${fraction}`;
}

function printLiteral(node) {
  switch (node.literalKind) {
    case 'INTEGER': return canonicalInteger(node.raw);
    case 'DECIMAL': return canonicalDecimal(node.raw);
    case 'COLOR': return node.raw.toLowerCase();
    case 'IDENT': return node.raw;
    case 'STRING': return node.raw.startsWith('"') ? node.raw : JSON.stringify(node.raw);
    default: return node.raw;
  }
}

function printExpression(node) {
  switch (node.kind) {
    case 'Literal': return printLiteral(node);
    case 'SymbolRef': return node.name;
    case 'CallExpression': return printCallExpression(node);
    default: throw new Error(`formatSCDLV2: cannot print expression of kind ${node.kind}.`);
  }
}

function printCallExpression(node) {
  const parts = [];
  const coveredNamed = new Set();
  if (node.positional && node.positional.length > 0) {
    parts.push(...node.positional.map(printExpression));
    const definition = getSCDLV2Opcode(node.opcode);
    if (definition) {
      for (let i = 0; i < node.positional.length && i < definition.operands.length; i++) {
        coveredNamed.add(definition.operands[i].name);
      }
    }
  }
  const namedKeys = node.named ? Object.keys(node.named) : [];
  if (namedKeys.length > 0) {
    const definition = getSCDLV2Opcode(node.opcode);
    const orderedNames = definition ? definition.operands.map((operand) => operand.name) : namedKeys;
    for (const name of orderedNames) {
      if (!coveredNamed.has(name) && node.named[name] !== undefined) {
        parts.push(`${name} ${printExpression(node.named[name])}`);
      }
    }
  }
  return parts.length > 0 ? `(${node.opcode} ${parts.join(' ')})` : `(${node.opcode})`;
}

function indentBlock(str, indent = '  ') {
  return str.split('\n').map((line) => `${indent}${line}`).join('\n');
}

function printStatement(node) {
  switch (node.kind) {
    case 'PaintStatement': {
      const parts = [`PAINT ${printExpression(node.shape)}`];
      if (node.named && node.named.AT) parts.push(`AT ${printExpression(node.named.AT)}`);
      if (node.fill) parts.push(`FILL ${printExpression(node.fill)}`);
      if (node.raster) parts.push(`RASTER ${printExpression(node.raster)}`);
      if (node.blend) parts.push(`BLEND ${printExpression(node.blend)}`);
      if (node.clipTo) parts.push(`CLIP_TO ${printExpression(node.clipTo)}`);
      if (node.material) parts.push(`MATERIAL ${printExpression(node.material)}`);
      if (node.opacity) parts.push(`OPACITY ${printExpression(node.opacity)}`);
      return parts.join(' ');
    }
    case 'LetStatement':
      return `LET ${node.symbol} ${node.declaredType.toUpperCase()} ${printExpression(node.value)}`;
    case 'ReturnStatement':
      return `RETURN ${printExpression(node.value)}`;
    case 'EmitStatement':
      return `EMIT ${printExpression(node.value)}`;
    case 'ForStatement': {
      const lines = [`FOR ${node.variable} IN ${printExpression(node.in)} {`];
      for (const stmt of node.body || []) lines.push(indentBlock(printStatement(stmt)));
      lines.push('}');
      return lines.join('\n');
    }
    case 'RadialStatement': {
      let rad = `RADIAL COUNT ${printExpression(node.count)}`;
      if (node.center) rad += ` CENTER ${printExpression(node.center)}`;
      if (node.radius) rad += ` RADIUS ${printExpression(node.radius)}`;
      rad += ' {';
      const lines = [rad];
      for (const stmt of node.body || []) lines.push(indentBlock(printStatement(stmt)));
      lines.push('}');
      return lines.join('\n');
    }
    case 'IfStatement': {
      const lines = [`IF ${printExpression(node.condition)} {`];
      for (const stmt of node.then || []) lines.push(indentBlock(printStatement(stmt)));
      if (node.else && node.else.length > 0) {
        lines.push('} ELSE {');
        for (const stmt of node.else) lines.push(indentBlock(printStatement(stmt)));
      }
      lines.push('}');
      return lines.join('\n');
    }
    case 'MatchStatement': {
      const lines = [`MATCH ${printExpression(node.target)} {`];
      for (const c of node.cases || []) {
        lines.push(`  CASE ${printExpression(c.pattern)} {`);
        for (const stmt of c.body || []) lines.push(indentBlock(printStatement(stmt), '    '));
        lines.push('  }');
      }
      if (node.default) {
        lines.push('  DEFAULT {');
        for (const stmt of node.default) lines.push(indentBlock(printStatement(stmt), '    '));
        lines.push('  }');
      }
      lines.push('}');
      return lines.join('\n');
    }
    default:
      throw new Error(`formatSCDLV2: cannot print statement of kind ${node.kind}.`);
  }
}

function printDeclarationLine(node) {
  switch (node.kind) {
    case 'VersionDeclaration':
      return `SCDL ${printExpression(node.version)}`;
    case 'AssetDeclaration':
      return `ASSET ${printExpression(node.id)}`;
    case 'CanvasDeclaration':
      return `CANVAS WIDTH ${printExpression(node.width)} HEIGHT ${printExpression(node.height)}`;
    case 'BudgetDeclaration': {
      let budgetLine = `BUDGET INSTRUCTIONS ${printExpression(node.instructions)} GENERATED_SHAPES ${printExpression(node.generatedShapes)} RASTER_CELLS ${printExpression(node.rasterCells)}`;
      if (node.recursionDepth) budgetLine += ` RECURSION_DEPTH ${printExpression(node.recursionDepth)}`;
      return budgetLine;
    }
    case 'ConstDeclaration':
      return `CONST ${node.symbol} ${node.declaredType.toUpperCase()} ${printExpression(node.value)}`;
    case 'ShapeDeclaration':
      return `SHAPE ${node.symbol} ${printExpression(node.value)}`;
    case 'ShapeBlockDeclaration': {
      const header = `SHAPE ${node.symbol}${node.isCompound ? ' COMPOUND' : ''} {`;
      const lines = [header];
      for (const stmt of node.body || []) {
        lines.push(indentBlock(printStatement(stmt)));
      }
      lines.push('}');
      return lines.join('\n');
    }
    case 'MaskDeclaration':
      return `MASK ${node.symbol} ${printExpression(node.value)}`;
    case 'AnchorDeclaration':
      return `ANCHOR ${node.symbol} ON ${printExpression(node.on)} AT ${printExpression(node.at)}`;
    case 'AssertDeclaration':
      return `ASSERT ${printExpression(node.condition)}`;
    case 'FnDeclaration': {
      let header = `FN ${node.id}`;
      for (const p of node.params || []) {
        header += ` PARAM ${p.name} ${p.type}`;
      }
      header += ` RETURNS ${node.returnType}`;
      if (node.recursionMax !== null && node.recursionMax !== undefined) {
        header += ` RECURSION_MAX ${node.recursionMax}`;
      }
      header += ' {';
      const lines = [header];
      for (const stmt of node.body || []) {
        lines.push(indentBlock(printStatement(stmt)));
      }
      lines.push('}');
      return lines.join('\n');
    }
    case 'SequenceDeclaration': {
      let header = `SEQUENCE ${node.symbol} TYPE ${node.itemType} COUNT ${printExpression(node.count)} {`;
      const lines = [header];
      for (const s of node.seeds || []) {
        lines.push(`  SEED ${printExpression(s)}`);
      }
      if (node.next) {
        lines.push(`  NEXT ${printExpression(node.next)}`);
      }
      lines.push('}');
      return lines.join('\n');
    }
    case 'RngDeclaration':
      return `RNG ${node.symbol} ALGORITHM ${node.algorithm} SEED ${printExpression(node.seed)}`;
    default:
      throw new Error(`formatSCDLV2: cannot print declaration of kind ${node.kind}.`);
  }
}

function printProgram(ast) {
  const lines = [];
  let lastCategory = null;
  for (const declaration of ast.declarations) {
    const category = declarationCategory(declaration.kind);
    if (lastCategory !== null && category !== lastCategory) lines.push('');
    if (declaration.kind === 'LayerDeclaration') {
      let header = `LAYER ${printExpression(declaration.id)} ORDER ${printExpression(declaration.order)}`;
      if (declaration.blend) header += ` BLEND ${printExpression(declaration.blend)}`;
      if (declaration.opacity) header += ` OPACITY ${printExpression(declaration.opacity)}`;
      if (declaration.visible) header += ` VISIBLE ${printExpression(declaration.visible)}`;
      lines.push(`${header} {`);
      for (const statement of declaration.body) lines.push(indentBlock(printStatement(statement)));
      lines.push('}');
    } else {
      lines.push(printDeclarationLine(declaration));
    }
    lastCategory = category;
  }
  return `${lines.join('\n')}\n`;
}

function isPreParsedV2Ast(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Array.isArray(value.declarations);
}

export function formatSCDLV2(input) {
  let parsed;
  if (typeof input === 'string') {
    parsed = parseSCDLV2(input);
  } else if (isPreParsedV2Ast(input)) {
    parsed = { ok: true, ast: input, diagnostics: [] };
  } else {
    parsed = { ok: false, ast: null, diagnostics: [] };
  }
  if (!parsed.ok || !parsed.ast) {
    return Object.freeze({ ok: false, output: null, ast: null, diagnostics: parsed.diagnostics });
  }
  try {
    const output = printProgram(parsed.ast);
    return Object.freeze({ ok: true, output, ast: parsed.ast, diagnostics: Object.freeze([]) });
  } catch {
    return Object.freeze({ ok: false, output: null, ast: null, diagnostics: Object.freeze([]) });
  }
}
