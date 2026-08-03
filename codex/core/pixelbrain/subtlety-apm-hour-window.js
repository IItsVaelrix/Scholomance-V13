function localParts(epochMs) {
  const date = new Date(epochMs);
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
    millisecond: date.getMilliseconds(),
    offsetMinutes: -date.getTimezoneOffset(),
  };
}

function isBoundary(epochMs) {
  const value = localParts(epochMs);
  return value.minute === 0
    && value.second === 0
    && value.millisecond === 0;
}

function seekBoundary(epochMs, direction) {
  let cursor = Math.floor(epochMs / 60_000) * 60_000;
  if (direction > 0 && cursor <= epochMs) cursor += 60_000;
  for (
    let inspected = 0;
    inspected <= 26 * 60;
    inspected += 1, cursor += direction * 60_000
  ) {
    if (isBoundary(cursor)) return cursor;
  }
  throw new RangeError('local hour boundary not found within 26 hours');
}

function offsetToken(minutes) {
  const sign = minutes >= 0 ? '+' : '-';
  const absolute = Math.abs(minutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}${String(absolute % 60).padStart(2, '0')}`;
}

export function localHourWindowContaining(epochMs) {
  const startMs = isBoundary(epochMs) ? epochMs : seekBoundary(epochMs, -1);
  const endMs = seekBoundary(startMs, 1);
  const start = localParts(startMs);
  const stem = [
    String(start.year).padStart(4, '0'),
    String(start.month).padStart(2, '0'),
    String(start.day).padStart(2, '0'),
    `${String(start.hour).padStart(2, '0')}00`,
  ].join('-');
  const label = `${stem}-UTC${offsetToken(start.offsetMinutes)}`;
  return {
    ...start,
    startMs,
    endMs,
    filename: `APM-${label}.md`,
    label,
  };
}

export function nextLocalHourBoundary(epochMs) {
  return seekBoundary(epochMs, 1);
}

export function isCompletedWindow(window, nowMs) {
  return window.endMs <= nowMs;
}

export function formatLocalTimestamp(epochMs) {
  const value = localParts(epochMs);
  const date = [
    String(value.year).padStart(4, '0'),
    String(value.month).padStart(2, '0'),
    String(value.day).padStart(2, '0'),
  ].join('-');
  const time = [
    String(value.hour).padStart(2, '0'),
    String(value.minute).padStart(2, '0'),
    String(value.second).padStart(2, '0'),
  ].join(':');
  const milliseconds = String(value.millisecond).padStart(3, '0');
  const offset = offsetToken(value.offsetMinutes).replace(/(..)$/u, ':$1');
  return `${date}T${time}.${milliseconds}${offset}`;
}
