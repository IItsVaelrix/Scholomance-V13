import { describe, it, expect } from "vitest";
import { Project } from "ts-morph";
import { RuleRegistry } from "../../src/core/scd64/RuleRegistry";

function scan(code: string) {
  const project = new Project({ useInMemoryFileSystem: true });
  const sf = project.createSourceFile("frag.tsx", code);
  return RuleRegistry.evaluateAll(sf);
}

const isFrontendFallback = (m: { ruleId: string }) =>
  m.ruleId === "SCD64.COLOR_DRAGON.FRONTEND_FALLBACK";

describe("RuleRegistry COLOR_DRAGON.FRONTEND_FALLBACK permanent block", () => {
  it("flags wordTruesight in a gated painter that lacks resolveGatedTruesightPaint", () => {
    const code = `
      function paint({ resonantCharStarts, charStart, word }) {
        const tier = resonantCharStarts.get(charStart);
        if (tier) return wordTruesight(word);
        return null;
      }
    `;
    const hits = scan(code).filter(isFrontendFallback);
    expect(hits).toHaveLength(1);
    expect(hits[0].family).toBe("COLOR_DRAGON");
  });

  it("suppresses when resolveGatedTruesightPaint is the paint authority", () => {
    const code = `
      function paint({ resonantCharStarts, charStart, tokenData, word }) {
        // legacy mention kept for docs:
        // wordTruesight(word) — FORBIDDEN on gated path
        return resolveGatedTruesightPaint({ resonantCharStarts, charStart, tokenData, word });
      }
    `;
    // Note: wordTruesight( still matches as a call in the comment above — use a
    // real call so the legacy pattern fires, then fix suppresses it.
    const codeWithCall = `
      function paint({ resonantCharStarts, charStart, tokenData, word }) {
        const _dead = wordTruesight;
        return resolveGatedTruesightPaint({ resonantCharStarts, charStart, tokenData, word });
      }
    `;
    // wordTruesight without call paren — should not flag
    expect(scan(codeWithCall).filter(isFrontendFallback)).toHaveLength(0);

    const stillLegacyCall = `
      function paint({ resonantCharStarts, charStart, tokenData, word }) {
        wordTruesight(word);
        return resolveGatedTruesightPaint({ resonantCharStarts, charStart, tokenData, word });
      }
    `;
    // Fix present → suppressed even if a leftover wordTruesight( call exists
    expect(scan(stillLegacyCall).filter(isFrontendFallback)).toHaveLength(0);
  });

  it("does NOT flag ungated preview helpers that never mention the resonance gate", () => {
    const code = `
      export function previewColor(word) {
        return wordTruesight(word);
      }
    `;
    expect(scan(code).filter(isFrontendFallback)).toHaveLength(0);
  });
});
