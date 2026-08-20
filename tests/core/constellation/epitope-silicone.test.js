/**
 * Epitope → silicone proposals.
 *
 * Production change that would make these fail: stamping grammar status,
 * looking up the live BONDS table to invent a result, or calling a
 * constructive phrase-builder "silicone-shaped."
 */
import { describe, expect, it } from 'vitest';

import { BOND_REACTION } from '../../../codex/core/constellation/bond-kind.js';
import { ELEMENT_PHASE } from '../../../codex/core/constellation/element-phase.js';
import {
  FROZEN_EPITOPE_SILICONE,
  hypothesizeComplement,
  matchedPlaceboSilicone,
  phaseOfProposal,
  proposeFromCall,
  signatureOfBond,
} from '../../../codex/core/constellation/epitope-silicone.js';

describe('epitope silicone proposals', () => {
  it('maps a seeking DET call to a nominal complement, not a guessed lemma', () => {
    expect(hypothesizeComplement('DET')).toEqual({ type: 'N', pos: 'n' });
    expect(hypothesizeComplement('AUX')).toEqual({ type: 'VP', pos: 'v' });
    expect(hypothesizeComplement('N')).toBeNull();
  });

  it('DET calling right into a hole proposes determine chemistry (carbon-shaped reaction)', () => {
    const p = proposeFromCall({
      callerType: 'DET',
      callerFrom: 0,
      unknownType: null,
      unknownFrom: 1,
    });
    expect(p.signature).toBe('DET|N|NP');
    expect(p.reaction).toBe(BOND_REACTION.CONSTRUCTIVE);
    expect(p.shape).toBe('carbon-shaped');
    expect(p.status).toBe('approximation');
    expect(phaseOfProposal(p)).toBe(ELEMENT_PHASE.SILICONE);
  });

  it('AUX calling right into a hole proposes preservative silicone-shaped chemistry', () => {
    const p = proposeFromCall({
      callerType: 'AUX',
      callerFrom: 0,
      unknownType: null,
      unknownFrom: 1,
    });
    expect(p.left).toBe('AUX');
    expect(p.right).toBe('VP');
    expect(p.result).toBe('VP');
    expect(p.reaction).toBe(BOND_REACTION.PRESERVATIVE);
    expect(p.shape).toBe('silicone-shaped');
  });

  it('silent typed unknown seeking a known host proposes host-preserving silicone', () => {
    const p = proposeFromCall({
      callerType: 'N',
      callerFrom: 1,
      unknownType: 'SUB',
      unknownFrom: 0,
    });
    expect(p.signature).toBe('SUB|N|N');
    expect(p.reaction).toBe(BOND_REACTION.PRESERVATIVE);
    expect(p.shape).toBe('silicone-shaped');
    expect(p.head).toBe(1);
  });

  it('does not propose when nothing seeks', () => {
    expect(proposeFromCall({
      callerType: 'N',
      callerFrom: 0,
      unknownType: null,
      unknownFrom: 1,
    })).toBeNull();
  });

  it('freezes the eight minted novel silicone signatures and does not add more', () => {
    const sigs = FROZEN_EPITOPE_SILICONE.bonds.map(signatureOfBond);
    expect(sigs).toEqual([
      'V|P|V',
      'N|P|N',
      'ADV|MODAL|ADV',
      'V|DET|V',
      'TO|DET|TO',
      'DET|ADV|DET',
      'DET|V|DET',
      'AUX|ADJ|ADJ',
    ]);
    expect(new Set(sigs).size).toBe(8);
  });

  it('builds a matched placebo that keeps left types and avoids treatment pairs', () => {
    const placebo = matchedPlaceboSilicone(FROZEN_EPITOPE_SILICONE.bonds, 0x53494c49);
    expect(placebo).toHaveLength(8);
    const treatLeft = FROZEN_EPITOPE_SILICONE.bonds.map((b) => b[0]).sort();
    const placeboLeft = placebo.map((b) => b[0]).sort();
    expect(placeboLeft).toEqual(treatLeft);
    const frozen = new Set(FROZEN_EPITOPE_SILICONE.bonds.map(signatureOfBond));
    for (const bond of placebo) {
      expect(frozen.has(signatureOfBond(bond))).toBe(false);
      expect(bond[2] === bond[0] || bond[2] === bond[1]).toBe(true);
    }
  });
});
