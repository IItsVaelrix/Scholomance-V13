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
