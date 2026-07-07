export type SchoolId = 'SONIC' | 'PSYCHIC' | 'ALCHEMY' | 'WILL' | 'VOID' | 'default';

export interface SchoolColors {
  primary: string;
  accent: string;
  glow: string;
}

export const SCHOOL_PALETTE: Record<SchoolId, SchoolColors> = {
  SONIC:   { primary: '#7c3aed', accent: '#a78bfa', glow: '#7c3aed' },
  PSYCHIC: { primary: '#06b6d4', accent: '#67e8f9', glow: '#06b6d4' },
  ALCHEMY: { primary: '#d946ef', accent: '#f0abfc', glow: '#d946ef' },
  WILL:    { primary: '#f97316', accent: '#fb923c', glow: '#f97316' },
  VOID:    { primary: '#71717a', accent: '#a1a1aa', glow: '#71717a' },
  default: { primary: '#c5a26f', accent: '#f1e7c8', glow: '#c5a26f' },
};

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 197, g: 162, b: 111 };
}

export function hexToRgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}
