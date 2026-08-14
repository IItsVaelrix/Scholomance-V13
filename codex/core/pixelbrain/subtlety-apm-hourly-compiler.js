import { sha256Hex } from './sha256.js';
import {
  buildEventChronicle,
  parseResonanceSnapshot,
} from './subtlety-apm-ledger.js';
import {
  formatLocalTimestamp,
  isCompletedWindow,
  localHourWindowContaining,
} from './subtlety-apm-hour-window.js';

export function discoverCompletedActiveWindows({ ledgerText, nowMs }) {
  const parsed = parseResonanceSnapshot({ ledgerText, cutoffMs: nowMs });
  const byFilename = new Map();
  for (const occurrence of parsed.fingerprints) {
    const window = localHourWindowContaining(occurrence.atMs);
    if (isCompletedWindow(window, nowMs)) {
      byFilename.set(window.filename, window);
    }
  }
  return [...byFilename.values()].sort((left, right) => (
    left.startMs - right.startMs
    || left.filename.localeCompare(right.filename)
  ));
}

function displayValue(value, fallback = 'unavailable') {
  if (value === undefined || value === null || value === '') return fallback;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function deriveActiveEvent(event, window) {
  const history = event.occurrences.filter((entry) => entry.atMs < window.endMs);
  const current = history.filter((entry) => entry.atMs >= window.startMs);
  if (current.length === 0) return null;
  const latest = history.at(-1);
  const latestAssessment = history
    .map((entry) => entry.assessment?.payload)
    .filter(Boolean)
    .at(-1);
  return {
    ...event,
    history,
    current,
    latest,
    latestAssessment,
    recurring: history.some((entry) => entry.atMs < window.startMs),
  };
}

function eventLines(event) {
  return [
    `## Event ${event.key}`,
    '',
    `- Stable event key: ${event.key}`,
    `- Runtime: ${event.runtime}`,
    `- Unit ID: ${event.unitId}`,
    `- Error type: ${event.errorType}`,
    `- Top frame: ${event.topFrame}`,
    `- First seen: ${formatLocalTimestamp(event.history[0].atMs)}`,
    `- Last seen: ${formatLocalTimestamp(event.latest.atMs)}`,
    `- Lifetime occurrences: ${event.history.length}`,
    `- Latest message: ${displayValue(event.latest.context.message)}`,
    `- Latest build: ${displayValue(event.latest.payload.execution?.buildId)}`,
    `- Latest thread: ${displayValue(event.latest.context.thread)}`,
    `- Drift: ${displayValue(event.latestAssessment?.drift)}`,
    `- Seam: ${displayValue(event.latestAssessment?.seam)}`,
    `- Propose-only remediation: ${displayValue(event.latestAssessment?.recovery?.proposals)}`,
    '',
    '### Occurrence times in this window',
    '',
    ...event.current.map((entry) => `- ${formatLocalTimestamp(entry.atMs)}`),
    '',
    '### All occurrence times through window end',
    '',
    ...event.history.map((entry) => `- ${formatLocalTimestamp(entry.atMs)}`),
    '',
  ];
}

/** `APM-2026-08-03-0900-UTC-0400.md` -> `2026-08-03-0900`. */
function windowStem(filename) {
  return filename.replace(/^APM-/u, '').replace(/-UTC[+-]\d{4}\.md$/u, '');
}

/**
 * ONE report for a whole backlog span, instead of one report per missed hour.
 *
 * compileHourlyReport re-parses the entire ledger per window and prints every
 * historical occurrence of every event in each report. That is fine for the one
 * window a live server actually produces; it is quadratic when a restart finds
 * three weeks of unreported hours, and on 2026-08-14 it drove the production
 * heap to 249/257MB and SIGABRT'd the machine into a reboot loop.
 *
 * So a backlog is ANALYSED, not replayed: parse once, aggregate across the span,
 * and emit per-event totals rather than per-hour transcripts. Cost is one parse
 * and one chronicle regardless of how many hours were missed.
 *
 * @param {{ledgerText: string, sourcePath: string, windows: Array<object>}} input
 */
export function compileBacklogDigest({ ledgerText, sourcePath, windows }) {
  if (!Array.isArray(windows) || windows.length === 0) {
    throw new TypeError('compileBacklogDigest requires at least one window');
  }
  const ordered = [...windows].sort((left, right) => left.startMs - right.startMs);
  const first = ordered[0];
  const last = ordered.at(-1);
  const offset = last.filename.match(/UTC([+-]\d{4})/u)?.[1] || '+0000';
  const filename = `APM-BACKLOG-${windowStem(first.filename)}-to-${windowStem(last.filename)}-UTC${offset}.md`;

  // The single parse. cutoff is the END of the span, so the digest sees exactly
  // what the last hourly report would have seen.
  const parsed = parseResonanceSnapshot({ ledgerText, cutoffMs: last.endMs });
  const chronicle = buildEventChronicle(parsed);

  const events = chronicle.events
    .map((event) => {
      const history = event.occurrences.filter((entry) => entry.atMs < last.endMs);
      const inSpan = history.filter((entry) => entry.atMs >= first.startMs);
      if (inSpan.length === 0) return null;
      return {
        ...event,
        history,
        inSpan,
        latest: history.at(-1),
        latestAssessment: history
          .map((entry) => entry.assessment?.payload)
          .filter(Boolean)
          .at(-1),
        predating: history.some((entry) => entry.atMs < first.startMs),
      };
    })
    .filter(Boolean)
    .sort((left, right) => (
      right.inSpan.length - left.inSpan.length
      || left.key.localeCompare(right.key)
    ));

  if (events.length === 0) {
    return { status: 'quiet', filename, windows: ordered };
  }

  const spanOccurrences = events.reduce((sum, event) => sum + event.inSpan.length, 0);
  const predating = events.filter((event) => event.predating).length;
  const lines = [
    '# Subtlety APM Backlog Digest',
    '',
    'One consolidated analysis of hours that elapsed while no reporter was',
    'running. Per-hour reports are deliberately NOT reconstructed: see',
    'compileBacklogDigest for why.',
    '',
    `- Span start: ${formatLocalTimestamp(first.startMs)}`,
    `- Span end: ${formatLocalTimestamp(last.endMs)}`,
    `- Hours covered: ${ordered.length}`,
    `- Timezone offset at end: UTC${offset}`,
    `- Source ledger: ${sourcePath}`,
    `- Source record set checksum: ${parsed.sourceRecordSetChecksum}`,
    '',
    '## Summary',
    '',
    `- Occurrences in span: ${spanOccurrences}`,
    `- Distinct events in span: ${events.length}`,
    `- First seen before span: ${predating}`,
    `- First seen within span: ${events.length - predating}`,
    '',
    '## Events',
    '',
    ...events.flatMap((event) => [
      `### ${event.key}`,
      '',
      `- Runtime: ${event.runtime}`,
      `- Unit ID: ${event.unitId}`,
      `- Error type: ${event.errorType}`,
      `- Top frame: ${event.topFrame}`,
      `- Occurrences in span: ${event.inSpan.length}`,
      `- Lifetime occurrences: ${event.history.length}`,
      `- First seen: ${formatLocalTimestamp(event.history[0].atMs)}`,
      `- Last seen: ${formatLocalTimestamp(event.latest.atMs)}`,
      `- Predates span: ${event.predating ? 'yes' : 'no'}`,
      `- Latest message: ${displayValue(event.latest.context.message)}`,
      `- Drift: ${displayValue(event.latestAssessment?.drift)}`,
      `- Seam: ${displayValue(event.latestAssessment?.seam)}`,
      '',
    ]),
    '## Warnings',
    '',
    ...(parsed.warnings.length > 0
      ? parsed.warnings.map((entry) => `- ${entry.code} [${entry.checksum}]: ${entry.detail}`)
      : ['- None']),
    '',
  ];
  const body = `${lines.join('\n')}\n`;
  const integrityChecksum = sha256Hex(body);

  return {
    status: 'report',
    filename,
    markdown: `${body}Report integrity checksum: ${integrityChecksum}\n`,
    integrityChecksum,
    sourceRecordSetChecksum: parsed.sourceRecordSetChecksum,
    windows: ordered,
    summary: {
      spanOccurrences,
      events: events.length,
      hoursCovered: ordered.length,
    },
  };
}

export function compileHourlyReport({ ledgerText, sourcePath, window }) {
  const parsed = parseResonanceSnapshot({
    ledgerText,
    cutoffMs: window.endMs,
  });
  const chronicle = buildEventChronicle(parsed);
  const activeEvents = chronicle.events
    .map((event) => deriveActiveEvent(event, window))
    .filter(Boolean)
    .sort((left, right) => (
      right.history.length - left.history.length
      || left.key.localeCompare(right.key)
    ));

  if (activeEvents.length === 0) {
    return {
      status: 'quiet',
      filename: window.filename,
      window,
    };
  }

  const windowOccurrences = activeEvents.reduce(
    (sum, event) => sum + event.current.length,
    0,
  );
  const recurringEvents = activeEvents.filter((event) => event.recurring).length;
  const newEvents = activeEvents.length - recurringEvents;
  const summary = {
    windowOccurrences,
    activeEvents: activeEvents.length,
    newEvents,
    recurringEvents,
  };
  const offset = window.filename.match(/UTC([+-]\d{4})/u)?.[1] || '+0000';
  const lines = [
    '# Subtlety APM Hourly Report',
    '',
    `- Window start: ${formatLocalTimestamp(window.startMs)}`,
    `- Window end: ${formatLocalTimestamp(window.endMs)}`,
    `- Canonical generation instant: ${formatLocalTimestamp(window.endMs)}`,
    `- Timezone offset at start: UTC${offset}`,
    `- Source ledger: ${sourcePath}`,
    `- Source record set checksum: ${parsed.sourceRecordSetChecksum}`,
    '',
    '## Summary',
    '',
    `- Current-window occurrences: ${windowOccurrences}`,
    `- Distinct active events: ${activeEvents.length}`,
    `- New events: ${newEvents}`,
    `- Recurring events: ${recurringEvents}`,
    '',
    ...activeEvents.flatMap((event) => eventLines(event)),
    '## Warnings',
    '',
    ...(parsed.warnings.length > 0
      ? parsed.warnings.map((entry) => (
        `- ${entry.code} [${entry.checksum}]: ${entry.detail}`
      ))
      : ['- None']),
    '',
  ];
  const body = `${lines.join('\n')}\n`;
  const integrityChecksum = sha256Hex(body);
  const markdown = `${body}Report integrity checksum: ${integrityChecksum}\n`;

  return {
    status: 'report',
    filename: window.filename,
    markdown,
    integrityChecksum,
    sourceRecordSetChecksum: parsed.sourceRecordSetChecksum,
    summary,
  };
}
