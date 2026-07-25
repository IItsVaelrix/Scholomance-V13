/**
 * Clause scoping for job-description text.
 *
 * Shared by the requirement ledger (which resolves modality from the clause around a term)
 * and the phrase-frame builder (which lifts its wording from that same clause). One
 * definition serves both: if they disagreed about which words belong to a requirement, a
 * card could be drafted from words the ledger never considered part of it.
 */

/**
 * Clause boundaries inside a line: `,` `;`, a sentence period (a period FOLLOWED BY
 * whitespace, so "Node.js" and "3.5 years" stay intact), and the contrastive conjunctions
 * that flip polarity mid-line.
 */
export const CLAUSE_SPLIT = /[;,]|(?<=\.)\s+|\bbut\b|\bhowever\b/gi;

/** The clause containing `start`, scoped to its line. */
export function clauseAt(text: string, start: number, end: number): string {
  const lineStart = text.lastIndexOf('\n', start) + 1;
  let lineEnd = text.indexOf('\n', end);
  if (lineEnd === -1) lineEnd = text.length;
  const line = text.slice(lineStart, lineEnd);
  const rel = start - lineStart;

  const bounds: number[] = [0];
  const re = new RegExp(CLAUSE_SPLIT.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    bounds.push(m.index + m[0].length);
    if (re.lastIndex === m.index) re.lastIndex++;
  }
  bounds.push(line.length);

  for (let i = 0; i < bounds.length - 1; i++) {
    if (rel >= bounds[i] && rel < bounds[i + 1]) return line.slice(bounds[i], bounds[i + 1]);
  }
  return line;
}
