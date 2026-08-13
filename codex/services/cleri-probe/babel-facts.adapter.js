/**
 * Babel-based source-to-facts adapter for Cleri Probe.
 *
 * Pure service: accepts a path and source text, emits normalized structural
 * facts. No fs/process/network access.
 */

import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
const traverse = typeof _traverse === "function" ? _traverse : _traverse.default;
import {
  createSourceSpan,
  deepFreeze,
  normalizeRepositoryPath
} from "../../core/immunity/cleri-probe/contracts.js";
import { sha256Hex } from "../../core/immunity/cleri-probe/canonical-report.js";

/**
 * Fact-schema version. Bump whenever the emitted fact shape changes: the
 * disposable index is keyed on it, so a stale cache can never feed an old fact
 * shape to a new verifier.
 */
export const PARSER_VERSION = "1.3.0";

const HOOKS = new Set([
  "useEffect",
  "useLayoutEffect",
  "useInsertionEffect",
  "useMemo",
  "useCallback",
  "useImperativeHandle"
]);

const CONCURRENT_PRIMITIVES = new Set([
  "Promise.all",
  "Promise.allSettled",
  "Promise.race",
  "Promise.any"
]);

const MUTATING_METHODS = new Set([
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "reverse",
  "sort",
  "fill",
  "copyWithin",
  "delete"
]);

/**
 * Methods that exist on Array/Map/Set and NOT on String.
 *
 * `includes`, `indexOf`, `slice`, `concat` and `length` are deliberately absent:
 * a string answers all of them, so they prove nothing about collection identity,
 * and `!someString` is a correct emptiness test where `!someArray` is not.
 */
const ARRAY_ONLY_METHODS = new Set([
  "map",
  "filter",
  "forEach",
  "some",
  "every",
  "find",
  "findIndex",
  "findLast",
  "reduce",
  "reduceRight",
  "flat",
  "flatMap",
  "join",
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "sort",
  "reverse",
  "fill",
  "toSorted",
  "toReversed"
]);

/** Methods that exist on Map/Set and not on Array or String. */
const MAP_SET_ONLY_METHODS = new Set(["add", "clear"]);

const CLIENT_PATTERNS = [
  { test: callee => callee === "fetch" || callee.startsWith("fetch."), client: "fetch" },
  { test: callee => callee === "axios" || callee.startsWith("axios."), client: "axios" },
  { test: callee => callee.includes("XMLHttpRequest"), client: "XMLHttpRequest" }
];

function isFunctionNode(node) {
  if (!node) return false;
  return (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression" ||
    node.type === "ObjectMethod" ||
    node.type === "ClassMethod" ||
    node.type === "ClassPrivateMethod"
  );
}

function buildLineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

function positionFromOffset(lineStarts, offset) {
  let line = 1;
  for (let i = 1; i < lineStarts.length; i++) {
    if (lineStarts[i] <= offset) line = i + 1;
    else break;
  }
  const column = offset - lineStarts[line - 1] + 1;
  return { line, column };
}

function canonicalDotted(node) {
  if (!node) return "";
  switch (node.type) {
    case "Identifier":
      return node.name;
    case "ThisExpression":
      return "this";
    case "Super":
      return "super";
    case "MemberExpression":
    case "OptionalMemberExpression": {
      const object = canonicalDotted(node.object);
      if (node.computed) {
        if (node.property.type === "StringLiteral" || node.property.type === "Literal") {
          return `${object}[${JSON.stringify(node.property.value)}]`;
        }
        return `${object}[?]`;
      }
      return `${object}.${node.property.name}`;
    }
    case "CallExpression":
    case "OptionalCallExpression":
      return `${canonicalDotted(node.callee)}()`;
    case "NewExpression":
      return `${canonicalDotted(node.callee)}()`;
    default:
      return `[${node.type}]`;
  }
}

function receiverOf(node) {
  if (node.type === "MemberExpression" || node.type === "OptionalMemberExpression") {
    return canonicalDotted(node.object);
  }
  return null;
}

function rootObjectName(node) {
  while (node && (node.type === "MemberExpression" || node.type === "OptionalMemberExpression")) {
    node = node.object;
  }
  return node && node.type === "Identifier" ? node.name : null;
}

function hookName(node) {
  if (node.type === "Identifier" && HOOKS.has(node.name)) return node.name;
  return null;
}

function clientForCallee(callee) {
  for (const pattern of CLIENT_PATTERNS) {
    if (pattern.test(callee)) return pattern.client;
  }
  return null;
}

function mutatingMethodName(node) {
  if (
    (node.type === "CallExpression" || node.type === "OptionalCallExpression") &&
    (node.callee.type === "MemberExpression" || node.callee.type === "OptionalMemberExpression") &&
    !node.callee.computed
  ) {
    return MUTATING_METHODS.has(node.callee.property.name) ? node.callee.property.name : null;
  }
  return null;
}

function collectIdentifierRoots(node, roots = []) {
  if (!node) return roots;
  switch (node.type) {
    case "Identifier":
      roots.push(node.name);
      break;
    case "MemberExpression":
    case "OptionalMemberExpression":
      collectIdentifierRoots(node.object, roots);
      break;
    case "UnaryExpression":
      collectIdentifierRoots(node.argument, roots);
      break;
    case "LogicalExpression":
    case "BinaryExpression":
      collectIdentifierRoots(node.left, roots);
      collectIdentifierRoots(node.right, roots);
      break;
    case "ConditionalExpression":
      collectIdentifierRoots(node.test, roots);
      break;
    case "CallExpression":
    case "OptionalCallExpression":
      collectIdentifierRoots(node.callee, roots);
      break;
    default:
      break;
  }
  return roots;
}

/**
 * Describes a call argument well enough for a verifier to prove identity:
 * the event name of a listener, the handler binding, or an options object.
 */
function describeArgument(node) {
  if (!node) return { type: "Unknown", value: null, name: null, keys: [], truthyKeys: [] };

  const described = {
    type: node.type,
    value: null,
    name: null,
    keys: [],
    truthyKeys: []
  };

  switch (node.type) {
    case "StringLiteral":
    case "NumericLiteral":
    case "BooleanLiteral":
      described.value = node.value;
      break;
    case "NullLiteral":
      described.value = null;
      break;
    case "Identifier":
      described.name = node.name;
      break;
    case "MemberExpression":
    case "OptionalMemberExpression":
      described.name = canonicalDotted(node);
      break;
    case "ObjectExpression":
      for (const prop of node.properties) {
        if (prop.type !== "ObjectProperty" || prop.computed) continue;
        const key = prop.key.type === "Identifier"
          ? prop.key.name
          : (prop.key.type === "StringLiteral" ? prop.key.value : null);
        if (!key) continue;
        described.keys.push(key);
        if (prop.value.type === "BooleanLiteral" && prop.value.value === true) {
          described.truthyKeys.push(key);
        }
      }
      described.keys.sort();
      described.truthyKeys.sort();
      break;
    default:
      break;
  }

  return described;
}

/** True when `name` appears as an identifier anywhere inside the subtree. */
function referencesIdentifier(node, name) {
  if (!node || typeof node !== "object" || !name) return false;
  if (node.type === "Identifier" && node.name === name) return true;

  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "start" || key === "end" || key === "leadingComments" ||
        key === "trailingComments" || key === "innerComments") {
      continue;
    }
    const value = node[key];
    if (Array.isArray(value)) {
      if (value.some(item => referencesIdentifier(item, name))) return true;
    } else if (value && typeof value === "object" && typeof value.type === "string") {
      if (referencesIdentifier(value, name)) return true;
    }
  }
  return false;
}

/**
 * Flattens a member expression into its root binding and property path,
 * recording whether any link in the chain is optional (`?.`).
 */
function memberChain(node) {
  const path = [];
  let optional = false;
  let computed = false;
  let current = node;

  while (current && (current.type === "MemberExpression" || current.type === "OptionalMemberExpression")) {
    if (current.optional) optional = true;
    if (current.computed) {
      computed = true;
      if (current.property.type === "StringLiteral") {
        path.unshift(current.property.value);
      } else {
        path.unshift("[?]");
      }
    } else if (current.property.type === "Identifier") {
      path.unshift(current.property.name);
    } else {
      path.unshift("[?]");
    }
    current = current.object;
  }

  if (!current || current.type !== "Identifier") {
    return null;
  }
  return { rootName: current.name, propertyPath: path, optional, computed };
}

/** Collects the dotted names read inside a guard test, e.g. `response.ok`. */
function collectDottedReads(node, out = []) {
  if (!node || typeof node !== "object" || typeof node.type !== "string") return out;
  if (node.type === "MemberExpression" || node.type === "OptionalMemberExpression") {
    out.push(canonicalDotted(node));
    return out;
  }
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "start" || key === "end") continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) collectDottedReads(item, out);
    } else if (value && typeof value === "object" && typeof value.type === "string") {
      collectDottedReads(value, out);
    }
  }
  return out;
}

/**
 * Collects the bare identifiers a guard test negates, e.g. `known` in
 * `!known && !isClosedClass`.
 *
 * Only a direct `!identifier` counts. `!items.length` is a length test and is
 * already visible through the guard's dotted reads, so folding it in here would
 * erase the very distinction this fact exists to draw.
 */
function collectNegatedRoots(node, out = []) {
  if (!node || typeof node !== "object" || typeof node.type !== "string") return out;
  if (node.type === "UnaryExpression" && node.operator === "!" && node.argument?.type === "Identifier") {
    out.push(node.argument.name);
  }
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "start" || key === "end") continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) collectNegatedRoots(item, out);
    } else if (value && typeof value === "object" && typeof value.type === "string") {
      collectNegatedRoots(value, out);
    }
  }
  return out;
}

/**
 * What the guarded branch does with control flow.
 *
 * BAILOUT — the branch returns, throws, breaks, or continues. A bail-out is how
 * a nullish check is written, so it reads very differently from a guard whose
 * branch goes on to do work.
 */
function consequentKind(statementNode) {
  if (!statementNode) return "NONE";
  if (statementNode.type !== "IfStatement") return "EXPRESSION";
  const consequent = statementNode.consequent;
  if (!consequent) return "NONE";
  const statements = consequent.type === "BlockStatement" ? consequent.body : [consequent];
  if (statements.length === 0) return "EMPTY";
  // The branch bails out whether it leaves immediately or records a message
  // first: `{ errors.push(...); return; }` is still a bail-out.
  const leaves = statements.some(statement =>
    statement.type === "ReturnStatement" ||
    statement.type === "ThrowStatement" ||
    statement.type === "BreakStatement" ||
    statement.type === "ContinueStatement"
  );
  return leaves ? "BAILOUT" : "WORK";
}

export function parseSourceFacts({ path: filePath, content }) {
  // Named filePath so it does not shadow Babel's visitor `path` in every visitor below.
  const normalizedPath = normalizeRepositoryPath(filePath);
  const source = String(content ?? "");
  const contentHash = sha256Hex(source);
  const parseContent = source.replace(/\r\n/g, "\n");
  const lineStarts = buildLineStarts(parseContent);

  const position = offset => positionFromOffset(lineStarts, Math.min(parseContent.length, Math.max(0, offset)));

  const makeId = (category, node) => {
    const start = position(node.start);
    const end = position(Math.max(node.start, node.end - 1));
    const payload = {
      category,
      path: normalizedPath,
      startLine: start.line,
      startColumn: start.column,
      endLine: end.line,
      endColumn: end.column
    };
    return `${category}-${sha256Hex(payload).slice(0, 16)}`;
  };

  const makeSpan = (node, symbol) => {
    const start = position(node.start);
    const end = position(Math.max(node.start, node.end - 1));
    return createSourceSpan({
      path: normalizedPath,
      startLine: start.line,
      startColumn: start.column,
      endLine: end.line,
      endColumn: end.column,
      symbol: symbol === undefined ? null : symbol,
      excerptDigest: sha256Hex(parseContent.slice(node.start, node.end))
    });
  };

  let ast;
  try {
    ast = parse(parseContent, {
      sourceType: "unambiguous",
      allowReturnOutsideFunction: true,
      plugins: [
        "typescript",
        "jsx",
        "classProperties",
        "objectRestSpread",
        "optionalChaining",
        "dynamicImport",
        "topLevelAwait",
        "decorators-legacy"
      ]
    });
  } catch (err) {
    const diagnostic = { code: "PARSE_FAILED", message: err.message };
    if (err.loc) {
      diagnostic.span = createSourceSpan({
        path: normalizedPath,
        startLine: err.loc.line,
        startColumn: err.loc.column,
        endLine: err.loc.line,
        endColumn: err.loc.column,
        symbol: null,
        excerptDigest: sha256Hex("")
      });
    }
    return deepFreeze({
      ok: false,
      path: normalizedPath,
      contentHash,
      parserVersion: PARSER_VERSION,
      functions: [],
      calls: [],
      effects: [],
      catchClauses: [],
      bindings: [],
      writes: [],
      memberReads: [],
      externalRequests: [],
      guards: [],
      collectionEvidence: [],
      concurrentCallbacks: [],
      comments: [],
      diagnostics: [deepFreeze(diagnostic)]
    });
  }

  const functions = [];
  const calls = [];
  const effects = [];
  const catchClauses = [];
  const bindings = [];
  const writes = [];
  const memberReads = [];
  const externalRequests = [];
  const guards = [];
  const collectionEvidence = [];
  const concurrentCallbacks = [];
  const comments = (ast.comments || []).map(comment => deepFreeze({
    type: comment.type,
    value: String(comment.value),
    startLine: comment.loc?.start?.line ?? 1,
    endLine: comment.loc?.end?.line ?? comment.loc?.start?.line ?? 1
  }));

  const functionNodeToId = new Map();
  const functionStack = [];
  const bindingStack = [new Map()];
  const catchStack = [];
  const catchState = new Map();
  const ccStack = [];
  const effectCandidates = [];

  const currentFunction = () => functionStack[functionStack.length - 1];
  const currentScope = () => bindingStack[bindingStack.length - 1];
  const currentCatchId = () => catchStack[catchStack.length - 1];
  const currentConcurrentCallbackId = () => ccStack[ccStack.length - 1] ?? null;

  const resolveBinding = name => {
    for (let i = bindingStack.length - 1; i >= 0; i--) {
      const id = bindingStack[i].get(name);
      if (id) return id;
    }
    return null;
  };

  const addBinding = (name, kind, functionId, idNode, extra = {}) => {
    const id = makeId("binding", idNode);
    currentScope().set(name, id);
    bindings.push({
      id,
      name,
      kind,
      functionId,
      importSource: extra.importSource ?? null,
      initKind: extra.initKind ?? null,
      initCallee: extra.initCallee ?? null,
      declarationSpan: makeSpan(idNode, name)
    });
    return id;
  };

  const extractPatternBindings = (pattern, kind, functionId, extra = {}) => {
    if (!pattern) return;
    if (pattern.type === "Identifier") {
      addBinding(pattern.name, kind, functionId, pattern, extra);
      return;
    }
    if (pattern.type === "ArrayPattern") {
      for (const element of pattern.elements) {
        if (element) extractPatternBindings(element, kind, functionId);
      }
      return;
    }
    if (pattern.type === "ObjectPattern") {
      for (const prop of pattern.properties) {
        if (prop.type === "ObjectProperty") {
          extractPatternBindings(prop.value, kind, functionId);
        } else if (prop.type === "RestElement") {
          extractPatternBindings(prop.argument, kind, functionId);
        }
      }
      return;
    }
    if (pattern.type === "AssignmentPattern") {
      extractPatternBindings(pattern.left, kind, functionId);
      return;
    }
    if (pattern.type === "RestElement") {
      extractPatternBindings(pattern.argument, kind, functionId);
    }
  };

  const detectConcurrentCallbackContext = path => {
    const parentPath = path.parentPath;
    const grandPath = parentPath?.parentPath;
    if (!grandPath) return null;
    const grand = grandPath.node;
    if (
      (grand.type === "CallExpression" || grand.type === "OptionalCallExpression") &&
      CONCURRENT_PRIMITIVES.has(canonicalDotted(grand.callee))
    ) {
      const primitive = canonicalDotted(grand.callee);
      const parent = parentPath.node;
      // Promise.all([...]) over an array literal: each callback runs once.
      if (parent.type === "ArrayExpression") return { primitive, iterator: null };
      // Promise.all(items.map(cb)): the callback runs once per item.
      if (parent.type === "CallExpression" || parent.type === "OptionalCallExpression") {
        const match = /\.(map|filter|flatMap|forEach|reduce)$/.exec(canonicalDotted(parent.callee));
        if (match) return { primitive, iterator: match[1] };
      }
    }
    return null;
  };

  const enterFunction = (path, name) => {
    const parentFunctionId = currentFunction() ? currentFunction().id : null;
    const id = makeId("fn", path.node);
    functionNodeToId.set(path.node, id);
    functions.push({
      id,
      name,
      span: makeSpan(path.node, name),
      parentFunctionId,
      async: Boolean(path.node.async)
    });
    functionStack.push({ id, node: path.node });
    bindingStack.push(new Map());
    for (const param of path.node.params) {
      extractPatternBindings(param, "param", id);
    }

    const concurrent = detectConcurrentCallbackContext(path);
    if (concurrent) {
      const ccId = makeId("cc", path.node);
      concurrentCallbacks.push({
        id: ccId,
        primitive: concurrent.primitive,
        iterator: concurrent.iterator,
        functionId: parentFunctionId,
        callbackFunctionId: id,
        span: makeSpan(path.node)
      });
      ccStack.push(ccId);
      return ccId;
    }
    return null;
  };

  const exitFunction = ccId => {
    functionStack.pop();
    bindingStack.pop();
    if (ccId) ccStack.pop();
  };

  // Root / program function.
  const program = ast.program;
  const rootId = makeId("fn", program);
  functionNodeToId.set(program, rootId);
  functions.push({
    id: rootId,
    name: null,
    span: makeSpan(program),
    parentFunctionId: null,
    async: false
  });
  functionStack.push({ id: rootId, node: program });

  const functionCcIds = new Map();

  traverse(ast, {
    FunctionDeclaration: {
      enter(path) {
        const name = path.node.id ? path.node.id.name : null;
        if (name) addBinding(name, "function", currentFunction().id, path.node.id);
        functionCcIds.set(path.node, enterFunction(path, name));
      },
      exit(path) {
        exitFunction(functionCcIds.get(path.node));
        functionCcIds.delete(path.node);
      }
    },
    FunctionExpression: {
      enter(path) {
        const name = path.node.id ? path.node.id.name : null;
        const ccId = enterFunction(path, name);
        if (name) addBinding(name, "function", currentFunction().id, path.node.id);
        functionCcIds.set(path.node, ccId);
      },
      exit(path) {
        exitFunction(functionCcIds.get(path.node));
        functionCcIds.delete(path.node);
      }
    },
    ArrowFunctionExpression: {
      enter(path) {
        functionCcIds.set(path.node, enterFunction(path, null));
      },
      exit(path) {
        exitFunction(functionCcIds.get(path.node));
        functionCcIds.delete(path.node);
      }
    },
    ObjectMethod: {
      enter(path) {
        const key = path.node.key;
        const name = key.type === "Identifier" && !path.node.computed ? key.name : null;
        functionCcIds.set(path.node, enterFunction(path, name));
      },
      exit(path) {
        exitFunction(functionCcIds.get(path.node));
        functionCcIds.delete(path.node);
      }
    },
    ClassMethod: {
      enter(path) {
        const key = path.node.key;
        const name = key.type === "Identifier" && !path.node.computed ? key.name : null;
        functionCcIds.set(path.node, enterFunction(path, name));
      },
      exit(path) {
        exitFunction(functionCcIds.get(path.node));
        functionCcIds.delete(path.node);
      }
    },
    ClassPrivateMethod: {
      enter(path) {
        functionCcIds.set(path.node, enterFunction(path, `#${path.node.key.id.name}`));
      },
      exit(path) {
        exitFunction(functionCcIds.get(path.node));
        functionCcIds.delete(path.node);
      }
    },
    VariableDeclaration(path) {
      const kind = path.node.kind;
      for (const declarator of path.node.declarations) {
        extractPatternBindings(declarator.id, kind, currentFunction().id, describeInit(declarator.init));
        if (declarator.id.type !== "Identifier" || !declarator.init) continue;
        const bindingId = resolveBinding(declarator.id.name);
        if (declarator.init.type === "ArrayExpression") {
          recordCollectionEvidence(bindingId, "ARRAY_LITERAL_INIT", declarator);
        } else if (
          declarator.init.type === "NewExpression" &&
          declarator.init.callee.type === "Identifier" &&
          (declarator.init.callee.name === "Map" || declarator.init.callee.name === "Set")
        ) {
          recordCollectionEvidence(bindingId, `${declarator.init.callee.name.toUpperCase()}_INIT`, declarator);
        }
      }
    },
    ImportDeclaration(path) {
      const importSource = path.node.source?.value ?? null;
      for (const specifier of path.node.specifiers) {
        if (specifier.type === "ImportDefaultSpecifier" ||
            specifier.type === "ImportSpecifier" ||
            specifier.type === "ImportNamespaceSpecifier") {
          addBinding(specifier.local.name, "import", currentFunction().id, specifier.local, { importSource });
        }
      }
    },
    ClassDeclaration(path) {
      if (path.node.id) {
        addBinding(path.node.id.name, "class", currentFunction().id, path.node.id);
      }
    },
    CatchClause: {
      enter(path) {
        const id = makeId("catch", path.node);
        const paramName = path.node.param?.type === "Identifier" ? path.node.param.name : null;
        catchStack.push(id);
        catchState.set(id, {
          // The function that owns the catch. Throws and returns inside a nested
          // function do not recover this catch, so they must not count as
          // counterevidence.
          ownerFunctionId: currentFunction().id,
          paramName,
          bodyStatementKinds: [],
          calls: [],
          localCalls: [],
          throwKinds: [],
          returnKinds: [],
          throws: false,
          returns: false
        });
        bindingStack.push(new Map());
        extractPatternBindings(path.node.param, "catch", currentFunction().id);
      },
      exit(path) {
        const id = catchStack.pop();
        const state = catchState.get(id);
        state.bodyStatementKinds = path.node.body.body.map(stmt => stmt.type);
        catchClauses.push({
          id,
          functionId: state.ownerFunctionId,
          paramName: state.paramName,
          bodyStatementKinds: state.bodyStatementKinds,
          calls: state.calls,
          localCalls: state.localCalls,
          throwKinds: state.throwKinds,
          returnKinds: state.returnKinds,
          throws: state.throws,
          returns: state.returns,
          span: makeSpan(path.node)
        });
        bindingStack.pop();
        catchState.delete(id);
      }
    },
    CallExpression(path) {
      recordCall(path);
    },
    OptionalCallExpression(path) {
      recordCall(path);
    },
    MemberExpression(path) {
      recordMemberRead(path);
    },
    OptionalMemberExpression(path) {
      recordMemberRead(path);
    },
    IfStatement(path) {
      recordGuards(path.node.test, path.node);
    },
    ConditionalExpression(path) {
      recordGuards(path.node.test, path.node);
    },
    LogicalExpression(path) {
      // `response.ok && use(response)` guards just as an if-statement does.
      if (path.node.operator === "&&" || path.node.operator === "||") {
        recordGuards(path.node.left, path.node, path.node);
      }
    },
    ThrowStatement(path) {
      const id = currentCatchId();
      if (!id) return;
      const state = catchState.get(id);
      if (state.ownerFunctionId !== currentFunction().id) return;
      state.throws = true;
      state.throwKinds.push(describeThrow(path.node.argument, state.paramName));
    },
    ReturnStatement(path) {
      const id = currentCatchId();
      if (!id) return;
      const state = catchState.get(id);
      if (state.ownerFunctionId !== currentFunction().id) return;
      state.returns = true;
      state.returnKinds.push(describeCatchReturn(path.node.argument, state.paramName));
    },
    AssignmentExpression(path) {
      recordWrite(path.node, path.node.operator, path.node.left);
    },
    UpdateExpression(path) {
      recordWrite(path.node, path.node.operator, path.node.argument);
    }
  });

  function recordCall(path) {
    const node = path.node;
    const callee = canonicalDotted(node.callee);
    const receiver = receiverOf(node.callee);
    const argumentKinds = node.arguments.map(arg => arg.type);
    const args = node.arguments.map(describeArgument);
    const method = node.callee.type === "MemberExpression" || node.callee.type === "OptionalMemberExpression"
      ? (node.callee.computed ? null : node.callee.property.name ?? null)
      : (node.callee.type === "Identifier" ? node.callee.name : null);
    const receiverBindingId = receiver ? resolveBinding(rootObjectName(node.callee)) : null;
    const id = makeId("call", node);
    const functionId = currentFunction().id;
    calls.push({
      id,
      callee,
      receiver,
      receiverBindingId,
      method,
      argumentKinds,
      args,
      functionId,
      span: makeSpan(node)
    });

    const catchId = currentCatchId();
    if (catchId) {
      const state = catchState.get(catchId);
      state.calls.push(id);
      if (state.ownerFunctionId === functionId) {
        state.localCalls.push(callee);
      }
    }

    const hook = hookName(node.callee);
    if (hook && node.arguments[0] && isFunctionNode(node.arguments[0])) {
      effectCandidates.push({ hook, callbackNode: node.arguments[0], callNode: node });
    }

    const methodName = mutatingMethodName(node);
    if (methodName) {
      const rootName = rootObjectName(node.callee);
      writes.push({
        bindingId: rootName ? resolveBinding(rootName) : null,
        operation: methodName,
        functionId,
        concurrentCallbackId: currentConcurrentCallbackId(),
        span: makeSpan(node)
      });
    }

    // Only a direct `binding.method()` proves anything about `binding`: in
    // `page.rows.map(...)` the array is `page.rows`, not `page`.
    if (method && receiverBindingId && node.callee.object?.type === "Identifier") {
      if (ARRAY_ONLY_METHODS.has(method)) {
        recordCollectionEvidence(receiverBindingId, `ARRAY_ONLY_METHOD:${method}`, node);
      } else if (MAP_SET_ONLY_METHODS.has(method)) {
        recordCollectionEvidence(receiverBindingId, `MAP_SET_METHOD:${method}`, node);
      }
    }
    if (callee === "Array.isArray" && node.arguments[0]?.type === "Identifier") {
      recordCollectionEvidence(resolveBinding(node.arguments[0].name), "ARRAY_ISARRAY_CHECK", node);
    }

    const client = clientForCallee(callee);
    if (client) {
      const bindingId = externalRequestBindingId(path);
      externalRequests.push({
        bindingId,
        client,
        functionId,
        span: makeSpan(node)
      });
    }
  }

  function externalRequestBindingId(path) {
    const grand = path.parentPath?.parentPath?.node;
    if (grand && grand.type === "VariableDeclarator" && grand.id.type === "Identifier") {
      return resolveBinding(grand.id.name);
    }
    const parent = path.parentPath?.node;
    if (parent && parent.type === "VariableDeclarator" && parent.id.type === "Identifier") {
      return resolveBinding(parent.id.name);
    }
    return null;
  }

  function recordWrite(node, operator, left) {
    let bindingId = null;
    let rootName = null;
    if (left.type === "Identifier") {
      rootName = left.name;
      bindingId = resolveBinding(rootName);
    } else if (left.type === "MemberExpression" || left.type === "OptionalMemberExpression") {
      rootName = rootObjectName(left);
      bindingId = rootName ? resolveBinding(rootName) : null;
    }
    if (!bindingId && !rootName) return;
    writes.push({
      bindingId,
      operation: operator,
      functionId: currentFunction().id,
      concurrentCallbackId: currentConcurrentCallbackId(),
      span: makeSpan(node)
    });
  }

  function recordGuards(testNode, statementNode, scopeNode = testNode) {
    const roots = [...new Set(collectIdentifierRoots(testNode))];
    const dotted = [...new Set(collectDottedReads(testNode))].sort();
    // `!items` is only half of `!items || items.length === 0`. A guard recorded
    // from one operand must still be able to see what the whole test asked.
    const scoped = scopeNode === testNode
      ? dotted
      : [...new Set(collectDottedReads(scopeNode))].sort();
    const negated = new Set(collectNegatedRoots(testNode));
    const branch = consequentKind(statementNode);
    for (const name of roots) {
      const bindingId = resolveBinding(name);
      if (bindingId) {
        guards.push({
          bindingId,
          kind: "TRUTHY",
          // Dotted reads let a verifier tell `if (response.ok)` (a status guard)
          // apart from `if (response)` (a mere existence check).
          properties: dotted.filter(entry => entry === name || entry.startsWith(`${name}.`)),
          scopeProperties: scoped.filter(entry => entry === name || entry.startsWith(`${name}.`)),
          // `!x` asks whether there is nothing; `x` asks whether there is
          // something. Only the first is an emptiness question.
          negated: negated.has(name),
          consequent: branch,
          functionId: currentFunction().id,
          span: makeSpan(statementNode)
        });
      }
    }
  }

  /**
   * Records proof that a binding holds an Array, Map, or Set.
   *
   * Only kinds a string cannot satisfy are recorded here: the whole purpose of
   * this fact is to separate `!collection` (never true for an empty one) from
   * `!string` (true for an empty one). Every candidate below was tried and
   * rejected against a real counter-example:
   *
   *   `.size`      a plain object may carry a field called `size` — `child.size`
   *                (width and height) in the modulation planner did.
   *   `for…of`     strings are iterable.
   *   `[...x]`     strings spread: `[...'ab']` is `['a','b']`.
   *   `x ? x : []` unifying with an array literal is the AUTHOR's type
   *                confusion, not proof of the type. Measured: it certified
   *                `const normalized = text && text.length ? text : []` and
   *                then convicted the correct `!text` empty-string check
   *                beside it.
   *
   * What survives is method identity: `map`, `filter`, `push`, `join` and their
   * kin exist on Array and not on String, and `new Map()` says so outright.
   */
  function recordCollectionEvidence(bindingId, kind, node) {
    if (!bindingId) return;
    collectionEvidence.push({
      bindingId,
      kind,
      functionId: currentFunction().id,
      span: makeSpan(node)
    });
  }

  function recordMemberRead(path) {
    const node = path.node;
    const parent = path.parentPath?.node;

    // Only the outermost link of a chain is a read: `a.b.c` is one read, not two.
    if (parent && (parent.type === "MemberExpression" || parent.type === "OptionalMemberExpression") &&
        parent.object === node) {
      return;
    }
    // Callees are recorded as calls; assignment targets are recorded as writes.
    if (parent && (parent.type === "CallExpression" || parent.type === "OptionalCallExpression") &&
        parent.callee === node) {
      return;
    }
    if (parent && parent.type === "AssignmentExpression" && parent.left === node) return;
    if (parent && parent.type === "UpdateExpression" && parent.argument === node) return;

    const chain = memberChain(node);
    if (!chain || chain.propertyPath.length === 0) return;

    const bindingId = resolveBinding(chain.rootName);
    memberReads.push({
      bindingId,
      rootName: chain.rootName,
      propertyPath: chain.propertyPath,
      optional: chain.optional,
      computed: chain.computed,
      functionId: currentFunction().id,
      span: makeSpan(node)
    });
  }

  function describeInit(init) {
    if (!init) return {};
    let node = init;
    if (node.type === "AwaitExpression") node = node.argument;

    if (node.type === "CallExpression" || node.type === "OptionalCallExpression") {
      return { initKind: "CALL", initCallee: canonicalDotted(node.callee) };
    }
    if (node.type === "MemberExpression" || node.type === "OptionalMemberExpression") {
      return { initKind: "MEMBER", initCallee: canonicalDotted(node) };
    }
    if (isFunctionNode(node)) {
      return { initKind: "FUNCTION", initCallee: null };
    }
    return { initKind: node.type, initCallee: null };
  }

  function describeThrow(argument, paramName) {
    if (!argument) return "RETHROW_BARE";
    if (argument.type === "Identifier") {
      return argument.name === paramName ? "RETHROW" : `THROW:${argument.name}`;
    }
    if (argument.type === "NewExpression") {
      return `NEW:${canonicalDotted(argument.callee)}`;
    }
    if (argument.type === "CallExpression" || argument.type === "OptionalCallExpression") {
      return `CALL:${canonicalDotted(argument.callee)}`;
    }
    return `THROW:${argument.type}`;
  }

  function describeCatchReturn(argument, paramName) {
    if (!argument) {
      return { kind: "VOID", objectKeys: [], callee: null, usesCatchParam: false };
    }

    const usesCatchParam = referencesIdentifier(argument, paramName);
    let node = argument;
    if (node.type === "AwaitExpression") node = node.argument;

    if (node.type === "ObjectExpression") {
      const objectKeys = [];
      for (const prop of node.properties) {
        if (prop.type !== "ObjectProperty" || prop.computed) continue;
        if (prop.key.type === "Identifier") objectKeys.push(prop.key.name);
        else if (prop.key.type === "StringLiteral") objectKeys.push(prop.key.value);
      }
      return { kind: "OBJECT", objectKeys: objectKeys.sort(), callee: null, usesCatchParam };
    }
    if (node.type === "CallExpression" || node.type === "OptionalCallExpression") {
      return {
        kind: "CALL",
        objectKeys: [],
        callee: canonicalDotted(node.callee),
        usesCatchParam
      };
    }
    if (node.type === "NullLiteral") {
      return { kind: "NULL", objectKeys: [], callee: null, usesCatchParam };
    }
    if (node.type === "Identifier" && node.name === "undefined") {
      return { kind: "UNDEFINED", objectKeys: [], callee: null, usesCatchParam };
    }
    return { kind: node.type, objectKeys: [], callee: null, usesCatchParam };
  }

  // Resolve effect cleanup callbacks now that every function has an id.
  for (const candidate of effectCandidates) {
    const callbackFunctionId = functionNodeToId.get(candidate.callbackNode) || null;
    const cleanup = callbackFunctionId
      ? findCleanup(candidate.callbackNode)
      : { returnFunctionId: null, returnsBindingName: null };
    effects.push({
      id: makeId("effect", candidate.callNode),
      hook: candidate.hook,
      callbackFunctionId,
      returnFunctionId: cleanup.returnFunctionId,
      // `return unsub;` is a cleanup just as much as `return () => unsub();`.
      returnsBindingName: cleanup.returnsBindingName,
      span: makeSpan(candidate.callNode)
    });
  }

  function describeCleanup(argument) {
    if (!argument) return { returnFunctionId: null, returnsBindingName: null };
    if (isFunctionNode(argument)) {
      return { returnFunctionId: functionNodeToId.get(argument) || null, returnsBindingName: null };
    }
    if (argument.type === "Identifier") {
      return { returnFunctionId: null, returnsBindingName: argument.name };
    }
    return { returnFunctionId: null, returnsBindingName: null };
  }

  function findCleanup(callbackNode) {
    if (callbackNode.body && callbackNode.body.type !== "BlockStatement") {
      return describeCleanup(callbackNode.body);
    }
    if (callbackNode.body && callbackNode.body.type === "BlockStatement") {
      for (const stmt of callbackNode.body.body) {
        if (stmt.type === "ReturnStatement" && stmt.argument) {
          return describeCleanup(stmt.argument);
        }
      }
    }
    return { returnFunctionId: null, returnsBindingName: null };
  }

  return deepFreeze({
    ok: true,
    path: normalizedPath,
    contentHash,
    parserVersion: PARSER_VERSION,
    functions,
    calls,
    effects,
    catchClauses,
    bindings,
    writes,
    memberReads,
    externalRequests,
    guards,
    collectionEvidence,
    concurrentCallbacks,
    comments,
    diagnostics: []
  });
}
