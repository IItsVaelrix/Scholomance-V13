export const SCDL_V2_HEADER = 'SCDL 2';

export function parseVersionHeader(source) {
  const text = typeof source === 'string' ? source.replace(/^\uFEFF/, '') : '';
  for (const line of text.split(/\r?\n/)) {
    const significant = line.trim();
    if (significant === '' || significant.startsWith('#') || significant.startsWith('//')) continue;
    const match = significant.match(/^SCDL\s+(\S+)$/);
    if (match) {
      const rawVer = match[1];
      if (rawVer === '2' || rawVer === '2.0') {
        return { explicit: true, version: 2, raw: significant, supported: true };
      }
      if (rawVer === '1' || rawVer === '1.0' || rawVer === '1.2') {
        return { explicit: true, version: 1, raw: significant, supported: true };
      }
      return { explicit: true, version: null, raw: significant, supported: false };
    }
    return { explicit: false, version: 1, raw: null, supported: true };
  }
  return { explicit: false, version: 1, raw: null, supported: true };
}

export function detectSCDLVersion(source) {
  const header = parseVersionHeader(source);
  return header.version === 2 ? 2 : 1;
}
