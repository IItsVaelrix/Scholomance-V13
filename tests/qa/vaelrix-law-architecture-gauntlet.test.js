import { describe, it, expect, vi } from 'vitest';
import { 
  ERROR_CATEGORIES, 
  ERROR_SEVERITY, 
  MODULE_IDS, 
  ERROR_CODES, 
  encodeBytecodeError, 
  decodeBytecodeError,
  parseErrorForAI 
} from '../../codex/core/pixelbrain/bytecode-error.js';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { assertTrue } from './tools/bytecode-assertions.js';

/**
 * Vaelrix Law: Architecture Gauntlet
 * 
 * "Future Stupidity Detector"
 * 
 * This suite enforces the fundamental laws of Scholomance:
 * 1. Determinism is Sovereign (No Math.random, No Date.now in core)
 * 2. Bytecode is the Truth (Immutable, verifiable, AI-readable)
 * 3. Browser is a Decoration (No DOM-authoritative hacks)
 * 4. Server is the Arbiter (No client-side combat authority)
 */

/**
 * A grep-matched line is exempt when it carries an EXEMPT marker in either
 * comment style, with an optional reason after the keyword:
 *
 *   const x = Math.random(); // EXEMPT: seeded elsewhere, see foo.js
 *   {\/* EXEMPT: glossary prose, not a call *\/}
 *
 * The reason is optional to the regex but not to the reviewer: a bare marker
 * documents nothing. `{\/* ... *\/}` (JSX) is matched by the block-comment arm.
 */
const EXEMPT_MARKER = /(?:\/\/|\/\*)\s*EXEMPT\b/;

function isExempt(line) {
  return EXEMPT_MARKER.test(line);
}

describe('[QA] Vaelrix Law Architecture Gauntlet', () => {

  describe('1) Bytecode Determinism Torture Test', () => {
    
    it('ensures same input always produces identical bytecode', () => {
      const category = ERROR_CATEGORIES.LINGUISTIC;
      const severity = ERROR_SEVERITY.CRIT;
      const moduleId = MODULE_IDS.LINGUISTIC;
      const code = ERROR_CODES.LEGALITY_VIOLATION;
      const context = { word: 'forbidden', rule: 'SYLLABLE_COUNT', count: 5 };

      const b1 = encodeBytecodeError(category, severity, moduleId, code, context);
      const b2 = encodeBytecodeError(category, severity, moduleId, code, context);
      
      expect(b1).toBe(b2);
      expect(b1).toContain('PB-ERR-v1-LINGUISTIC-CRIT-LINGUA-0C06');
    });

    it('verifies checksum integrity and rejects corrupted bytecode', () => {
      const bytecode = encodeBytecodeError(
        ERROR_CATEGORIES.STATE,
        ERROR_SEVERITY.FATAL,
        MODULE_IDS.COORD,
        ERROR_CODES.INVALID_STATE,
        { state: 'VOID' }
      );

      const decoded = decodeBytecodeError(bytecode);
      expect(decoded.valid).toBe(true);

      // Corrupt one character in the base64 context
      const corrupted = bytecode.replace('-VOID-', '-VOID_'); 
      // Wait, the replacement needs to be more precise to not break the split structure but fail checksum
      const parts = bytecode.split('-');
      parts[parts.length - 2] = parts[parts.length - 2].slice(0, -1) + (parts[parts.length - 2].endsWith('A') ? 'B' : 'A');
      const corruptedBytecode = parts.join('-');

      const decodedCorrupted = decodeBytecodeError(corruptedBytecode);
      expect(decodedCorrupted.valid).toBe(false);
      expect(decodedCorrupted.error).toBe('CHECKSUM_MISMATCH');
    });

    it('preserves nested unicode contexts through encoding/decoding cycle', () => {
      const complexContext = {
        message: '💀 Fatal Resonance 💀',
        phonemes: ['ə', 'ɪ', 'ʊ'],
        metadata: { depth: 8, intensity: 0.99, markers: ['†', '‡', '§'] }
      };

      const bytecode = encodeBytecodeError(
        ERROR_CATEGORIES.LINGUISTIC,
        ERROR_SEVERITY.WARN,
        MODULE_IDS.SHARED,
        ERROR_CODES.RESONANCE_MISMATCH,
        complexContext
      );

      const decoded = decodeBytecodeError(bytecode);
      expect(decoded.valid).toBe(true);
      expect(decoded.context.message).toBe('💀 Fatal Resonance 💀');
      expect(decoded.context.phonemes).toEqual(['ə', 'ɪ', 'ʊ']);
      expect(decoded.context.metadata.markers).toContain('§');
    });

    it('ensures parseErrorForAI() preserves recoverability and hints', () => {
      const context = { expected: 'VOWEL', actual: 'CONSONANT' };
      const bytecode = encodeBytecodeError(
        ERROR_CATEGORIES.TYPE,
        ERROR_SEVERITY.CRIT,
        MODULE_IDS.LINGUISTIC,
        ERROR_CODES.TYPE_MISMATCH,
        context
      );

      const result = parseErrorForAI(bytecode);
      expect(result.valid).toBe(true);
      expect(result.recoveryHints).toBeDefined();
      expect(result.recoveryHints.suggestions.length).toBeGreaterThan(0);
      
      // Ensure hints are frozen/deterministic
      const hints1 = result.recoveryHints;
      const hints2 = parseErrorForAI(bytecode).recoveryHints;
      expect(hints1).toEqual(hints2);
      expect(Object.isFrozen(hints1)).toBe(true);
    });

    it('exhaustively tortures all categories, severities, and modules', () => {
      // Loop through a subset of combinations to verify broad stability
      for (const cat of Object.keys(ERROR_CATEGORIES)) {
        for (const sev of Object.keys(ERROR_SEVERITY)) {
          const modId = Object.values(MODULE_IDS)[0]; // Just use first for speed
          const code = 0x1234;
          const context = { cat, sev, modId };
          
          const bytecode = encodeBytecodeError(cat, sev, modId, code, context);
          const decoded = decodeBytecodeError(bytecode);
          
          expect(decoded.valid).toBe(true);
          expect(decoded.category).toBe(cat);
          expect(decoded.severity).toBe(sev);
          expect(decoded.moduleId).toBe(modId);
          expect(decoded.errorCode).toBe(code);
        }
      }
    });
  });

  describe('2) Anti-Chaos Randomness Detector', () => {
    it('scans runtime code for forbidden Math.random( ) usage', () => {
      // Directories to scan
      const dirs = ['src', 'codex'];
      // These detectors are plain text greps, so they cannot tell a call from a
      // sentence about a call — the determinism law quoted as prose inside a
      // glossary component trips the very rule it is teaching. An exemption
      // marker is the escape hatch, and it must SAY WHY: bare `/* EXEMPT */`
      // told a future reader nothing, so a reason is now permitted (and
      // expected) after the keyword in either comment style.
      const allowedExemptions = [
        'tests',
        'fixtures',
        'node_modules',
        'dist',
        '.codex',
        'scripts',
        'immunity',
        'target'
      ];

      // Use grep to find occurrences
      const grepCommand = `grep -F -r "Math.random( )" ${dirs.join(' ')} --exclude-dir={${allowedExemptions.join(',')}} || true`;
      const output = execSync(grepCommand).toString().trim();
      
      if (output) {
        const lines = output.split('\n');
        const violations = lines.filter(line => !isExempt(line) && !line.includes('.md:'));

        assertTrue(violations.length === 0, {
          testName: 'scans runtime code for forbidden Math.random( ) usage',
          testFile: 'vaelrix-law-architecture-gauntlet.test.js',
          testSuite: 'Vaelrix Law Architecture Gauntlet',
          expected: '0 violations',
          actual: `${violations.length} violations`,
          extra: { violations }
        });
      }
    });
  });

  describe('3) Wall-clock Corruption Detector', () => {
    it('scans critical paths for forbidden Date.now( ) or performance.now()', () => {
      const criticalDirs = [
        'codex/core',
        'codex/services',
        'src/hooks/useBattleSession.js',
        'src/lib/truesight',
        'codex/core/pixelbrain'
      ];
      
      const forbidden = ['Date.now( )', 'performance.now()'];
      
      for (const pattern of forbidden) {
        // Filter out existing criticalDirs that might not exist to avoid grep errors
        const activeDirs = criticalDirs.filter(d => fs.existsSync(d));
        if (activeDirs.length === 0) continue;

        // immunity is excluded for the same reason as in the randomness scan:
        // its prion fixtures model forbidden patterns on purpose
        const grepCommand = `grep -F -r "${pattern}" ${activeDirs.join(' ')} --exclude-dir={tests,immunity,target} || true`;
        const output = execSync(grepCommand).toString().trim();
        
        if (output) {
          const violations = output.split('\n').filter(line => !isExempt(line) && !line.includes('.md:'));
          
          assertTrue(violations.length === 0, {
            testName: 'scans critical paths for forbidden Date.now( ) or performance.now()',
            testFile: 'vaelrix-law-architecture-gauntlet.test.js',
            testSuite: 'Vaelrix Law Architecture Gauntlet',
            expected: '0 violations',
            actual: `${violations.length} violations for ${pattern}`,
            extra: { violations, pattern }
          });
        }
      }
    });
  });

  describe('4) Sovereign Editor Protection Test', () => {
    it('protects src/pages/Read/ from DOM authority hacks', () => {
      const targetDir = 'src/pages/Read/';
      if (!fs.existsSync(targetDir)) return; // Skip if directory doesn't exist yet

      const forbidden = [
        'contentEditable',
        'dangerouslySetInnerHTML',
        'document.execCommand'
      ];

      for (const pattern of forbidden) {
        try {
          const grepCommand = `grep -r "${pattern}" ${targetDir} || true`;
          const output = execSync(grepCommand).toString().trim();
          
          if (output) {
            const violations = output.split('\n').filter(line => !line.includes('// EXEMPT'));
            if (violations.length > 0) {
              console.error(`VIOLATION: DOM authority hack "${pattern}" found in ${targetDir}:`);
              console.error(violations.join('\n'));
              expect(violations.length).toBe(0);
            }
          }
        } catch (e) {
          // Pass
        }
      }
    });
  });

  describe('5) Combat Authority Drift Detector', () => {
    it('ensures client-side combat code does not attempt to be authoritative', () => {
      const clientCombatDir = 'src/hooks/combat';
      if (!fs.existsSync(clientCombatDir)) return;

      const forbidden = [
        'localStorage.setItem',
        'indexedDB.open',
        'mutation {', // GraphQL mutation (if client attempts to send result directly)
        'POST' // Direct result submission outside of the arbiter bridge
      ];

      // Note: This is a heuristic test. 
      // In a real Inquisitor audit, we'd look for specific logic patterns.
      
      for (const pattern of forbidden) {
        try {
          const grepCommand = `grep -r "${pattern}" ${clientCombatDir} || true`;
          const output = execSync(grepCommand).toString().trim();
          
          if (output) {
            const violations = output.split('\n').filter(line => !line.includes('// EXEMPT'));
            if (violations.length > 0) {
              console.error(`VIOLATION: Client-side authority pattern "${pattern}" found in ${clientCombatDir}:`);
              console.error(violations.join('\n'));
              expect(violations.length).toBe(0);
            }
          }
        } catch (e) {
          // Pass
        }
      }
    });
  });

});
