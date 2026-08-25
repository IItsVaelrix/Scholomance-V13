export const buildReport = (findings, options) => {
  const rows = findings.map((f) => ({ path: f.path, line: f.line }));
  if (!rows.length) {
    return { rows: [], empty: true };
  }
  return { rows, empty: false, options };
};

export class LensRegistry {
  constructor(entries) {
    this.entries = entries;
  }

  register(name, fn) {
    this.entries.set(name, fn);
    return this;
  }
}

export const memoized = React.memo(function Inner({ value }) {
  return value * 2;
});
