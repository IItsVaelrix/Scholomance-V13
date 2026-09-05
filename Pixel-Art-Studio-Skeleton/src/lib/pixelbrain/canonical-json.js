/**
 * Canonical JSON — Python-compatible serialization for cross-language checksums.
 *
 * .pbrain packet checksums are FNV-1a-32 over the packet serialized by Python's
 * `json.dumps(body, separators=(",", ":"))` (compact, ensure_ascii, insertion
 * key order). JavaScript's JSON.stringify cannot reproduce that byte stream:
 * it collapses float literals (`64.0` → `64`), leaves non-ASCII unescaped, and
 * switches to exponent notation at different magnitudes than Python's repr().
 *
 * This module closes the gap:
 *   - `canonicalStringify(value)` emits the Python-compact form.
 *   - `parseCanonicalJson(text)` parses JSON while PRESERVING numeric literal
 *     types (int vs float) and object key order, so a .pbrain file written by
 *     Python round-trips byte-identically. Objects parse to Map (plain JS
 *     objects reorder integer-like keys); numbers parse to JsonNumber.
 *   - `pyFloat(n)` marks a JS number as a Python float at emit time (JS cannot
 *     distinguish 64.0 from 64 on its own).
 *
 * Reference verifier: steamdeck_brain/vaelrix_forcefield/pixelbrain/pbrain_checksum.py
 */

/** Marks a JS number as a Python float so it serializes with float repr (e.g. "64.0"). */
export class PyFloat {
  constructor(value) {
    this.value = Number(value);
  }
}

export function pyFloat(value) {
  return new PyFloat(value);
}

/** Number parsed from JSON text with its original lexeme preserved. */
export class JsonNumber {
  constructor(lexeme) {
    this.lexeme = String(lexeme);
  }
  get isFloat() {
    return /[.eE]/.test(this.lexeme);
  }
  valueOf() {
    return Number(this.lexeme);
  }
}

/**
 * Python repr() of a float, e.g. 64 → "64.0", 1e16 → "1e+16", 1e-5 → "1e-05".
 * Python uses positional notation for decimal exponents in [-4, 15] and
 * scientific notation (sign + ≥2-digit exponent) outside that range.
 */
export function pythonFloatRepr(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) {
    throw new TypeError(`Non-finite float not allowed in canonical JSON: ${x}`);
  }
  if (Object.is(n, -0)) return '-0.0';

  // toExponential() with no argument yields the shortest round-trip digits.
  const m = n.toExponential().match(/^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/);
  const sign = m[1];
  const digits = m[2] + (m[3] || '');
  const exp = parseInt(m[4], 10);

  if (exp < -4 || exp >= 16) {
    const mantissa = m[3] ? `${m[2]}.${m[3]}` : m[2];
    const expSign = exp < 0 ? '-' : '+';
    const expAbs = String(Math.abs(exp)).padStart(2, '0');
    return `${sign}${mantissa}e${expSign}${expAbs}`;
  }
  if (exp >= digits.length - 1) {
    return `${sign}${digits}${'0'.repeat(exp - (digits.length - 1))}.0`;
  }
  if (exp >= 0) {
    return `${sign}${digits.slice(0, exp + 1)}.${digits.slice(exp + 1)}`;
  }
  return `${sign}0.${'0'.repeat(-exp - 1)}${digits}`;
}

const SHORT_ESCAPES = {
  '"': '\\"',
  '\\': '\\\\',
  '\b': '\\b',
  '\f': '\\f',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
};

/** Python json.dumps string escaping with ensure_ascii=True (pure-ASCII output). */
function quoteString(s) {
  let out = '"';
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    const code = s.charCodeAt(i);
    if (SHORT_ESCAPES[ch]) {
      out += SHORT_ESCAPES[ch];
    } else if (code < 0x20 || code > 0x7e) {
      out += `\\u${code.toString(16).padStart(4, '0')}`;
    } else {
      out += ch;
    }
  }
  return out + '"';
}

function normalizeNumberLexeme(lexeme) {
  if (/[.eE]/.test(lexeme)) {
    return pythonFloatRepr(Number(lexeme));
  }
  // Integer lexeme: normalize via BigInt (handles "-0" → "0", arbitrary width).
  return BigInt(lexeme).toString();
}

function stringifyNumber(n) {
  if (Number.isSafeInteger(n)) return String(n);
  return pythonFloatRepr(n);
}

/**
 * Serialize a value exactly as Python `json.dumps(value, separators=(",", ":"))`.
 *
 * Accepts Map (preferred for objects — preserves key order under all keys),
 * plain objects (Object.entries order; note JS reorders integer-like keys),
 * arrays, strings, numbers (safe integers → int form, others → float repr),
 * PyFloat, JsonNumber, booleans, null.
 */
export function canonicalStringify(value) {
  if (value === null) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (typeof value === 'number') return stringifyNumber(value);
  if (typeof value === 'string') return quoteString(value);
  if (value instanceof PyFloat) return pythonFloatRepr(value.value);
  if (value instanceof JsonNumber) return normalizeNumberLexeme(value.lexeme);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(',')}]`;
  }
  if (value instanceof Map) {
    const entries = [];
    for (const [k, v] of value) {
      if (typeof k !== 'string') throw new TypeError('Canonical JSON object keys must be strings');
      entries.push(`${quoteString(k)}:${canonicalStringify(v)}`);
    }
    return `{${entries.join(',')}}`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).map(
      ([k, v]) => `${quoteString(k)}:${canonicalStringify(v)}`
    );
    return `{${entries.join(',')}}`;
  }
  throw new TypeError(`Value not serializable as canonical JSON: ${typeof value}`);
}

/**
 * Parse JSON text preserving what JSON.parse destroys: numbers become
 * JsonNumber (original lexeme kept, so 64.0 stays a float) and objects become
 * Map (insertion order kept even for integer-like keys).
 */
export function parseCanonicalJson(text) {
  const src = String(text);
  let pos = 0;

  function fail(message) {
    throw new SyntaxError(`Canonical JSON parse error at index ${pos}: ${message}`);
  }

  function skipWs() {
    while (pos < src.length && (src[pos] === ' ' || src[pos] === '\t' || src[pos] === '\n' || src[pos] === '\r')) {
      pos += 1;
    }
  }

  function parseString() {
    // src[pos] === '"'
    pos += 1;
    let out = '';
    while (pos < src.length) {
      const ch = src[pos];
      if (ch === '"') {
        pos += 1;
        return out;
      }
      if (ch === '\\') {
        const esc = src[pos + 1];
        pos += 2;
        switch (esc) {
          case '"': out += '"'; break;
          case '\\': out += '\\'; break;
          case '/': out += '/'; break;
          case 'b': out += '\b'; break;
          case 'f': out += '\f'; break;
          case 'n': out += '\n'; break;
          case 'r': out += '\r'; break;
          case 't': out += '\t'; break;
          case 'u': {
            const hex = src.slice(pos, pos + 4);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail(`invalid \\u escape "${hex}"`);
            out += String.fromCharCode(parseInt(hex, 16));
            pos += 4;
            break;
          }
          default: fail(`invalid escape "\\${esc}"`);
        }
      } else if (ch.charCodeAt(0) < 0x20) {
        fail('unescaped control character in string');
      } else {
        out += ch;
        pos += 1;
      }
    }
    return fail('unterminated string');
  }

  function parseValue() {
    skipWs();
    const ch = src[pos];
    if (ch === undefined) fail('unexpected end of input');
    if (ch === '{') {
      pos += 1;
      const map = new Map();
      skipWs();
      if (src[pos] === '}') { pos += 1; return map; }
      for (;;) {
        skipWs();
        if (src[pos] !== '"') fail('expected string key');
        const key = parseString();
        skipWs();
        if (src[pos] !== ':') fail('expected ":"');
        pos += 1;
        map.set(key, parseValue());
        skipWs();
        if (src[pos] === ',') { pos += 1; continue; }
        if (src[pos] === '}') { pos += 1; return map; }
        fail('expected "," or "}"');
      }
    }
    if (ch === '[') {
      pos += 1;
      const arr = [];
      skipWs();
      if (src[pos] === ']') { pos += 1; return arr; }
      for (;;) {
        arr.push(parseValue());
        skipWs();
        if (src[pos] === ',') { pos += 1; continue; }
        if (src[pos] === ']') { pos += 1; return arr; }
        fail('expected "," or "]"');
      }
    }
    if (ch === '"') return parseString();
    if (src.startsWith('true', pos)) { pos += 4; return true; }
    if (src.startsWith('false', pos)) { pos += 5; return false; }
    if (src.startsWith('null', pos)) { pos += 4; return null; }
    const numMatch = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(src.slice(pos));
    if (numMatch) {
      pos += numMatch[0].length;
      return new JsonNumber(numMatch[0]);
    }
    return fail(`unexpected character "${ch}"`);
  }

  const result = parseValue();
  skipWs();
  if (pos !== src.length) fail('trailing content after JSON value');
  return result;
}

/** Re-serialize raw JSON text into its Python-canonical compact form. */
export function canonicalizeJsonText(text) {
  return canonicalStringify(parseCanonicalJson(text));
}
