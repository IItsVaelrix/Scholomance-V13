// Deterministic, dependency-free CSV reader/writer for the Career Graph build.
//
// The normalized Career Graph interchange format (see README.md) is fully under
// our control, so we only need RFC-4180 essentials: quoted fields, escaped
// double quotes, commas/newlines inside quotes, and CRLF tolerance. We avoid
// pulling in `csv-parse` so the scaffold runs offline with zero install.

/**
 * Parse CSV text into an array of row objects keyed by the header row.
 * Empty input yields []. A header column appearing twice throws.
 *
 * @param {string} text
 * @param {{ delimiter?: string }} [options] delimiter defaults to ',' (use '\t' for TSV)
 * @returns {Record<string, string>[]}
 */
export function parseCsv(text, options = {}) {
  const rows = parseCsvRows(text, options);
  if (rows.length === 0) return [];
  const header = rows[0];
  const seen = new Set();
  for (const col of header) {
    if (seen.has(col)) throw new Error(`CAREER_CSV_DUPLICATE_COLUMN:${col}`);
    seen.add(col);
  }
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    // Skip fully-empty trailing lines.
    if (cells.length === 1 && cells[0] === '') continue;
    const obj = {};
    for (let c = 0; c < header.length; c++) {
      obj[header[c]] = c < cells.length ? cells[c] : '';
    }
    out.push(obj);
  }
  return out;
}

/**
 * Parse CSV text into a raw array of string arrays (no header mapping).
 * @param {string} text
 * @param {{ delimiter?: string }} [options] delimiter defaults to ','
 * @returns {string[][]}
 */
export function parseCsvRows(text, options = {}) {
  const delimiter = options.delimiter || ',';
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      pushField();
      i += 1;
      continue;
    }
    if (ch === '\r') {
      // Treat CRLF and lone CR as a row terminator.
      if (text[i + 1] === '\n') i += 1;
      pushRow();
      i += 1;
      continue;
    }
    if (ch === '\n') {
      pushRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  // Flush the final field/row if there is any pending content.
  if (field !== '' || row.length > 0) pushRow();
  return rows;
}

const NEEDS_QUOTING = /[",\r\n]/;

function encodeField(value) {
  const s = value == null ? '' : String(value);
  if (NEEDS_QUOTING.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Serialize row objects into CSV text using the provided column order.
 * Deterministic: columns are emitted exactly in `columns` order, rows in input
 * order. Always terminates the final line with a newline.
 *
 * @param {string[]} columns
 * @param {Record<string, unknown>[]} rows
 * @returns {string}
 */
export function stringifyCsv(columns, rows) {
  const lines = [columns.map(encodeField).join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => encodeField(row[c])).join(','));
  }
  return lines.join('\n') + '\n';
}
