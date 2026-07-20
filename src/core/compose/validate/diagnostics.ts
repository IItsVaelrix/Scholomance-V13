/**
 * PB-ERR-compatible compose diagnostics (PDR §16).
 */

export type DiagnosticSeverity = 'ERROR' | 'WARN' | 'INFO';

export interface ComposeDiagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  sourceNodeId?: string;
  adapter?: string;
  contractVersion?: string;
  recovery?: string;
  context?: Record<string, unknown>;
}

export function diag(
  code: string,
  severity: DiagnosticSeverity,
  message: string,
  extra: Partial<ComposeDiagnostic> = {},
): ComposeDiagnostic {
  return { code, severity, message, ...extra };
}

export const CODES = {
  UNKNOWN_KIND: 'PB-UI-001',
  DUPLICATE_ID: 'PB-UI-002',
  UNKNOWN_SLOT: 'PB-UI-003',
  INVALID_INSTANCE: 'PB-UI-004',
  EVENT_TARGET: 'PB-UI-005',
  OPTIONAL_CAP: 'PB-UI-006',
  REQUIRED_CAP: 'PB-UI-007',
  A11Y: 'PB-UI-008',
  LAYOUT_MODE: 'PB-LAYOUT-001',
  CONSTRAINT_LIMIT: 'PB-LAYOUT-002',
  SOFT_CONSTRAINT: 'PB-LAYOUT-003',
  CONSTRAINT_CONFLICT: 'PB-LAYOUT-004',
  TAFFY_DRIFT: 'PB-LAYOUT-005',
  UNKNOWN_EVENT: 'PB-EVENT-001',
  INVALID_PAYLOAD: 'PB-EVENT-002',
  EVENT_IGNORED: 'PB-EVENT-003',
  RENDER_FAIL: 'PB-RENDER-001',
  RENDER_FALLBACK: 'PB-RENDER-002',
} as const;
