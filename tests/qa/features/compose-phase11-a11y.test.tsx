/**
 * PDR Phase 11 — Advanced Validation (axe + compose audit pipeline)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { featureFlags, COMPOSE_FLAGS } from '../../../src/core/compose/flags';
import { ComposeScrollEditorToolbar } from '../../../src/core/compose/migrated/ComposeScrollEditorToolbar';
import {
  auditComposeA11y,
  formatA11yAuditSummary,
} from '../../../src/core/compose/validate/a11y-audit';
import { CODES } from '../../../src/core/compose/validate/diagnostics';

expect.extend(toHaveNoViolations);

describe('Compose Phase 11 — axe / a11y audit', () => {
  beforeEach(() => {
    featureFlags.clear();
    featureFlags.enable(COMPOSE_FLAGS.MIGRATE_TOOLBAR);
  });

  it('ComposeScrollEditorToolbar has no jest-axe violations', async () => {
    const { container } = render(
      <ComposeScrollEditorToolbar
        isEditable={false}
        showMinimapControl
        showSettingsControl
        onEdit={() => {}}
        onNewScroll={() => {}}
        onToggleMinimap={() => {}}
        onOpenSearch={() => {}}
        onCycleAuroraLevel={() => {}}
        onToggleFocus={() => {}}
        onSettingsClick={() => {}}
        includeWandOrnament={false}
      />,
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('auditComposeA11y maps clean toolbar to PB-UI-008 pass', async () => {
    const { container } = render(
      <ComposeScrollEditorToolbar
        onOpenSearch={() => {}}
        includeWandOrnament={false}
      />,
    );

    const audit = await auditComposeA11y(container);
    expect(audit.ok).toBe(true);
    expect(formatA11yAuditSummary(audit)).toMatch(/pass/);
  });

  it('auditComposeA11y emits PB-UI-008 diagnostics for unlabeled button', async () => {
    const host = document.createElement('div');
    const btn = document.createElement('button');
    // no accessible name
    host.appendChild(btn);
    document.body.appendChild(host);

    const audit = await auditComposeA11y(host);
    expect(audit.ok).toBe(false);
    expect(audit.diagnostics.some((d) => d.code === CODES.A11Y)).toBe(true);

    host.remove();
  });
});
