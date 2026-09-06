export const SCDL_V2_HEADER = 'SCDL 2';

export function detectSCDLVersion(source) {
  const text = typeof source === 'string' ? source.replace(/^\uFEFF/, '') : '';
  for (const line of text.split(/\r?\n/)) {
    const significant = line.trim();
    if (significant === '' || significant.startsWith('#')) continue;
    return significant === SCDL_V2_HEADER ? 2 : 1;
  }
  return 1;
}
