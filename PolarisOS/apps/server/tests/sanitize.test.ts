/**
 * sanitize unit tests (PDR §21 "sanitize chat output").
 *
 * Verifies control-character stripping, whitespace collapse, trimming, length
 * capping, and that legitimate unicode prose survives untouched.
 */
import { describe, it, expect } from "vitest";
import { sanitizeText, sanitizeChat } from "../src/sanitize.js";

describe("sanitizeText", () => {
  it("strips non-printable control characters but keeps tab/newline as spaces", () => {
    expect(sanitizeText("a\u0000b\u0007c\u001Fd")).toBe("abcd");
    // tab / newline / cr are whitespace → collapsed to a single space
    expect(sanitizeText("line1\nline2\ttab\r\ncr")).toBe("line1 line2 tab cr");
  });

  it("collapses whitespace runs and trims", () => {
    expect(sanitizeText("   hello    world   ")).toBe("hello world");
    expect(sanitizeText("\n\n  spaced  \n\t out  ")).toBe("spaced out");
  });

  it("enforces the default 1000-char cap for chat", () => {
    const long = "x".repeat(5000);
    expect(sanitizeChat(long)).toHaveLength(1000);
  });

  it("honors a custom maxLength", () => {
    expect(sanitizeText("abcdefghij", { maxLength: 4 })).toBe("abcd");
  });

  it("preserves legitimate unicode prose (accents, CJK, emoji)", () => {
    expect(sanitizeText("café 日本語 🏮 lantern")).toBe("café 日本語 🏮 lantern");
  });

  it("is total: non-string input yields an empty string, never throws", () => {
    expect(sanitizeText(undefined)).toBe("");
    expect(sanitizeText(null)).toBe("");
    expect(sanitizeText(42)).toBe("");
    expect(sanitizeText({})).toBe("");
  });

  it("returns empty for whitespace-only input", () => {
    expect(sanitizeText("   \n\t  ")).toBe("");
  });

  it("neutralizes an embedded script tag as inert text (client renders textContent)", () => {
    // We do not need to strip HTML (the client never parses it), but the output
    // must be a plain string with no control chars and collapsed whitespace.
    const out = sanitizeChat('<script>alert("x")</script> hi');
    expect(out).toBe('<script>alert("x")</script> hi');
    // eslint-disable-next-line no-control-regex
    expect(out).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/);
  });
});
