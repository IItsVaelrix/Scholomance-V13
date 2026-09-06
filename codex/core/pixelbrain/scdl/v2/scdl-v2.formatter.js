import { parseSCDLV2 } from './scdl-v2.parser.js';
import { getSCDLV2Opcode } from './scdl-v2.opcodes.js';

const HEADER_KINDS = new Set(['VersionDeclaration', 'AssetDeclaration', 'CanvasDeclaration', 'BudgetDeclaration']);
const BINDING_KINDS = new Set(['ConstDeclaration', 'ShapeDeclaration']);

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
  if (node.positional.length > 0) {
    return `(${node.opcode} ${node.positional.map(printExpression).join(' ')})`;
  }
  const namedKeys = Object.keys(node.named);
  if (namedKeys.length > 0) {
    const definition = getSCDLV2Opcode(node.opcode);
    const orderedNames = definition ? definition.operands.map((operand) => operand.name) : namedKeys;
    const parts = orderedNames
      .filter((name) => node.named[name] !== undefined)
      .map((name) => `${name} ${printExpression(node.named[name])}`);
    return `(${node.opcode} ${parts.join(' ')})`;
  }
  return `(${node.opcode})`;
}

function printStatement(node) {
  switch (node.kind) {
    case 'PaintStatement':
      return `PAINT ${printExpression(node.shape)} FILL ${printExpression(node.fill)} RASTER ${printExpression(node.raster)}`;
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
    case 'BudgetDeclaration':
      return `BUDGET INSTRUCTIONS ${printExpression(node.instructions)} GENERATED_SHAPES ${printExpression(node.generatedShapes)} RASTER_CELLS ${printExpression(node.rasterCells)}`;
    case 'ConstDeclaration':
      return `CONST ${node.symbol} ${node.declaredType.toUpperCase()} ${printExpression(node.value)}`;
    case 'ShapeDeclaration':
      return `SHAPE ${node.symbol} ${printExpression(node.value)}`;
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
      lines.push(`LAYER ${printExpression(declaration.id)} ORDER ${printExpression(declaration.order)} {`);
      for (const statement of declaration.body) lines.push(`  ${printStatement(statement)}`);
      lines.push('}');
    } else {
      lines.push(printDeclarationLine(declaration));
    }
    lastCategory = category;
  }
  return `${lines.join('\n')}\n`;
}

export function formatSCDLV2(input) {
  const parsed = typeof input === 'string'
    ? parseSCDLV2(input)
    : { ok: Boolean(input), ast: input, diagnostics: [] };
  if (!parsed.ok || !parsed.ast) {
    return Object.freeze({ ok: false, output: null, ast: null, diagnostics: parsed.diagnostics });
  }
  const output = printProgram(parsed.ast);
  return Object.freeze({ ok: true, output, ast: parsed.ast, diagnostics: Object.freeze([]) });
}
