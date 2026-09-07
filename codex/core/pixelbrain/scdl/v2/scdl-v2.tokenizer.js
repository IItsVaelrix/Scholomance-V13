import { span, v2Diagnostic } from './scdl-v2.diagnostics.js';

export const TOKEN_KINDS = Object.freeze([
  'WORD', 'SYMBOL', 'INTEGER', 'DECIMAL', 'COLOR', 'STRING',
  'LBRACE', 'RBRACE', 'LPAREN', 'RPAREN', 'LBRACKET', 'RBRACKET', 'COMMA',
  'WHITESPACE', 'NEWLINE', 'COMMENT', 'INVALID', 'EOF',
]);

const PUNCTUATION = Object.freeze({
  '{': 'LBRACE',
  '}': 'RBRACE',
  '(': 'LPAREN',
  ')': 'RPAREN',
  '[': 'LBRACKET',
  ']': 'RBRACKET',
  ',': 'COMMA',
});

const isSpace = (char) => char === ' ' || char === '\t' || char === '\f' || char === '\v';
const isWordStart = (char) => Boolean(char && /[A-Za-z_]/.test(char));
const isWordPart = (char) => Boolean(char && /[A-Za-z0-9_.-]/.test(char));
const isBoundary = (char) => !char || isSpace(char) || char === '\r' || char === '\n' || PUNCTUATION[char] || char === '$';

export function tokenizeSCDLV2(source) {
  const text = typeof source === 'string' ? source : '';
  const tokens = [];
  const diagnostics = [];
  const cursor = { offset: 0, line: 1, column: 1 };

  const point = () => ({ ...cursor });
  const advance = (count = 1) => {
    for (let index = 0; index < count; index += 1) {
      const char = text[cursor.offset];
      cursor.offset += 1;
      if (char === '\r' && text[cursor.offset] === '\n') {
        cursor.offset += 1;
        index += 1;
        cursor.line += 1;
        cursor.column = 1;
      } else if (char === '\r' || char === '\n') {
        cursor.line += 1;
        cursor.column = 1;
      } else {
        cursor.column += 1;
      }
    }
  };
  const emit = (kind, start, raw, value = raw) => {
    const tokenSpan = span(start, point());
    tokens.push(Object.freeze({ kind, raw, value, span: tokenSpan }));
    return tokenSpan;
  };
  const diagnostic = (code, message, tokenSpan, expected, received) => {
    diagnostics.push(v2Diagnostic({
      code,
      phase: 'LEX',
      message,
      span: tokenSpan,
      expected,
      received,
    }));
  };

  while (cursor.offset < text.length) {
    const start = point();
    const char = text[cursor.offset];

    // Leading U+FEFF is trivia so detectSCDLVersion and this scanner agree.
    if (cursor.offset === 0 && char === '\uFEFF') {
      advance();
      emit('WHITESPACE', start, char);
      continue;
    }
    if (char === '\r' || char === '\n') {
      const length = char === '\r' && text[cursor.offset + 1] === '\n' ? 2 : 1;
      const raw = text.slice(cursor.offset, cursor.offset + length);
      advance(length);
      emit('NEWLINE', start, raw);
      continue;
    }
    if (isSpace(char)) {
      let end = cursor.offset + 1;
      while (end < text.length && isSpace(text[end])) end += 1;
      const raw = text.slice(cursor.offset, end);
      advance(raw.length);
      emit('WHITESPACE', start, raw);
      continue;
    }
    if (char === '#') {
      const colorMatch = text.slice(cursor.offset).match(/^#[0-9a-f]{6}(?:[0-9a-f]{2})?(?=$|[ \t\f\v\r\n{}()[\],$])/i);
      if (colorMatch) {
        const colorRaw = colorMatch[0];
        advance(colorRaw.length);
        emit('COLOR', start, colorRaw, colorRaw.toUpperCase());
        continue;
      }
      const next = text[cursor.offset + 1];
      if (!next || isSpace(next) || next === '\r' || next === '\n') {
        let commentEnd = cursor.offset + 1;
        while (commentEnd < text.length && text[commentEnd] !== '\r' && text[commentEnd] !== '\n') commentEnd += 1;
        const commentRaw = text.slice(cursor.offset, commentEnd);
        advance(commentRaw.length);
        emit('COMMENT', start, commentRaw, commentRaw.slice(1));
        continue;
      }
      let end = cursor.offset + 1;
      while (end < text.length && !isBoundary(text[end])) end += 1;
      const raw = text.slice(cursor.offset, end);
      advance(raw.length);
      const colorSpan = emit('INVALID', start, raw, raw);
      diagnostic('SCDL-LEX-002', 'Malformed color literal; expected #RRGGBB or #RRGGBBAA.', colorSpan, ['#RRGGBB', '#RRGGBBAA'], [raw]);
      continue;
    }
    if (char === '"') {
      let end = cursor.offset + 1;
      while (end < text.length && text[end] !== '"' && text[end] !== '\r' && text[end] !== '\n') {
        if (text[end] === '\\' && end + 1 < text.length) end += 2;
        else end += 1;
      }
      if (end < text.length && text[end] === '"') {
        end += 1;
        const stringRaw = text.slice(cursor.offset, end);
        advance(stringRaw.length);
        emit('STRING', start, stringRaw, stringRaw.slice(1, -1));
        continue;
      }
      const raw = text.slice(cursor.offset, end);
      advance(raw.length);
      const stringSpan = emit('INVALID', start, raw, raw);
      diagnostic('SCDL-LEX-003', 'Unterminated string literal.', stringSpan, ['"'], [raw]);
      continue;
    }
    if (text.startsWith('=>', cursor.offset)) {
      advance(2);
      emit('ARROW', start, '=>');
      continue;
    }
    if (PUNCTUATION[char]) {
      advance();
      emit(PUNCTUATION[char], start, char);
      continue;
    }
    const symbolMatch = text.slice(cursor.offset).match(/^\$[A-Za-z_][A-Za-z0-9_.-]*/);
    if (symbolMatch) {
      const raw = symbolMatch[0];
      advance(raw.length);
      emit('SYMBOL', start, raw);
      continue;
    }
    const versionMatch = text.slice(cursor.offset).match(/^\d+\.\d+\.\d+(?:[A-Za-z0-9_.-]*)/);
    if (versionMatch) {
      const raw = versionMatch[0];
      advance(raw.length);
      emit('WORD', start, raw);
      continue;
    }
    const decimalMatch = text.slice(cursor.offset).match(/^-?(?:\d+\.\d+|\.\d+)/);
    if (decimalMatch) {
      const raw = decimalMatch[0];
      advance(raw.length);
      emit('DECIMAL', start, raw);
      continue;
    }
    const integerMatch = text.slice(cursor.offset).match(/^-?\d+/);
    if (integerMatch) {
      const raw = integerMatch[0];
      advance(raw.length);
      emit('INTEGER', start, raw);
      continue;
    }
    if (isWordStart(char)) {
      let end = cursor.offset + 1;
      while (end < text.length && isWordPart(text[end])) end += 1;
      const raw = text.slice(cursor.offset, end);
      advance(raw.length);
      emit('WORD', start, raw);
      continue;
    }

    advance();
    const tokenSpan = emit('INVALID', start, char, char);
    diagnostic('SCDL-LEX-001', `Illegal character ${JSON.stringify(char)}.`, tokenSpan, ['word', 'symbol', 'number', 'color', 'punctuation'], [char]);
  }

  const eofStart = point();
  emit('EOF', eofStart, '', '');
  return Object.freeze({
    ok: diagnostics.length === 0,
    source: text,
    tokens: Object.freeze(tokens),
    diagnostics: Object.freeze(diagnostics),
  });
}
