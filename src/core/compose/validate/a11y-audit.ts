/**
 * Phase 11 — axe-core accessibility audit for compose surfaces.
 * Maps axe violations into PB-UI-008 ComposeDiagnostic entries.
 */

import type { AxeResults, Result as AxeViolation } from 'axe-core';
import { CODES, diag, type ComposeDiagnostic } from './diagnostics';

export type A11yAuditOptions = {
  /** axe rules to run; default WCAG 2 A/AA + best-practice tags via caller */
  rules?: Record<string, { enabled: boolean }>;
  /** Fail audit on these impact levels (default: critical + serious) */
  failImpacts?: Array<'critical' | 'serious' | 'moderate' | 'minor'>;
};

export type A11yAuditResult = {
  ok: boolean;
  diagnostics: ComposeDiagnostic[];
  violationCount: number;
  raw?: AxeResults;
};

const DEFAULT_FAIL: NonNullable<A11yAuditOptions['failImpacts']> = [
  'critical',
  'serious',
];

function violationToDiagnostic(v: AxeViolation): ComposeDiagnostic {
  const impact = v.impact ?? 'moderate';
  const severity =
    impact === 'critical' || impact === 'serious' ? 'ERROR' : 'WARN';
  return diag(CODES.A11Y, severity, `${v.id}: ${v.help}`, {
    adapter: 'axe-core',
    recovery: v.helpUrl,
    context: {
      impact,
      nodes: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
      tags: v.tags,
    },
  });
}

/**
 * Run axe against a DOM subtree and lower results to compose diagnostics.
 * Uses dynamic import so axe-core stays out of the production app chunk
 * unless an audit path loads it.
 */
export async function auditComposeA11y(
  element: Element,
  options: A11yAuditOptions = {},
): Promise<A11yAuditResult> {
  const failImpacts = new Set(options.failImpacts ?? DEFAULT_FAIL);

  // Dynamic import — audit-only dependency surface
  const axeMod = await import('axe-core');
  const axe = axeMod.default ?? axeMod;

  const raw = (await axe.run(element, {
    rules: options.rules,
    resultTypes: ['violations'],
  })) as AxeResults;

  const diagnostics = raw.violations.map(violationToDiagnostic);
  const blocking = raw.violations.filter((v) =>
    failImpacts.has((v.impact ?? 'moderate') as 'critical' | 'serious' | 'moderate' | 'minor'),
  );

  return {
    ok: blocking.length === 0,
    diagnostics,
    violationCount: raw.violations.length,
    raw,
  };
}

/**
 * Summarize audit for CI logs / PB-ERR style reporting.
 */
export function formatA11yAuditSummary(result: A11yAuditResult): string {
  if (result.ok && result.violationCount === 0) {
    return 'PB-UI-008: pass (0 violations)';
  }
  const lines = result.diagnostics.map(
    (d) => `${d.severity} ${d.code} ${d.message}`,
  );
  return [`PB-UI-008: ${result.ok ? 'warn-only' : 'fail'} (${result.violationCount} violations)`, ...lines].join('\n');
}
