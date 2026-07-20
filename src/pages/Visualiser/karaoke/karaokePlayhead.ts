/**
 * O(1) karaoke playhead — attribute/class flips only. No React setState.
 * Expects `data-k-line` on line elements and `data-k-word` on word spans.
 *
 * Does NOT accumulate sung history: previous word/line markers are cleared
 * before the next is set. Cost per tick is constant, not O(words so far).
 */

export type KaraokePlayheadTarget = {
  line: number;
  word: number;
  backing?: boolean;
  estimated?: boolean;
};

type PlayheadState = {
  lineEl: HTMLElement | null;
  wordEl: HTMLElement | null;
};

const stateByRoot = new WeakMap<HTMLElement, PlayheadState>();

function clearLine(el: HTMLElement | null) {
  if (!el) return;
  el.classList.remove('is-highlight', 'is-active');
  el.removeAttribute('aria-current');
}

function clearWord(el: HTMLElement | null) {
  if (!el) return;
  el.removeAttribute('data-sung');
  el.removeAttribute('data-timing');
}

/**
 * Apply playhead to lyrics root. Idempotent. Visualiser uses `is-highlight`;
 * Album uses `is-active` — both markers are set so one helper serves both.
 */
export function applyKaraokePlayhead(
  root: HTMLElement,
  target: KaraokePlayheadTarget,
): void {
  const prev = stateByRoot.get(root) ?? { lineEl: null, wordEl: null };
  const line =
    target.line >= 0
      ? (root.querySelector(`[data-k-line="${target.line}"]`) as HTMLElement | null)
      : null;
  const word =
    line && target.word >= 0
      ? (line.querySelector(`[data-k-word="${target.word}"]`) as HTMLElement | null)
      : null;

  if (prev.lineEl !== line) {
    clearLine(prev.lineEl);
    if (line) {
      line.classList.add('is-highlight', 'is-active');
      line.setAttribute('aria-current', 'true');
    }
  }

  if (prev.wordEl !== word) {
    clearWord(prev.wordEl);
    if (word) {
      word.setAttribute('data-sung', target.backing ? 'backing' : 'true');
      if (target.estimated) word.setAttribute('data-timing', 'estimated');
    }
  } else if (word) {
    word.setAttribute('data-sung', target.backing ? 'backing' : 'true');
    if (target.estimated) word.setAttribute('data-timing', 'estimated');
    else word.removeAttribute('data-timing');
  }

  stateByRoot.set(root, { lineEl: line, wordEl: word });
}
