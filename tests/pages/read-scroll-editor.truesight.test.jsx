import { render } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("../../src/hooks/usePhonemeEngine.jsx", () => ({
  usePhonemeEngine: () => ({ engine: null }),
}));

import ScrollEditor from "../../src/pages/Read/ScrollEditor.jsx";
import { ThemeProvider } from "../../src/hooks/useTheme.jsx";

function hexToRgbString(hex) {
  const normalized = hex.replace("#", "");
  const expanded = normalized.length === 3
    ? normalized.split("").map((char) => `${char}${char}`).join("")
    : normalized;
  const channels = expanded.match(/.{1,2}/g) || [];
  const [r, g, b] = channels.map((channel) => Number.parseInt(channel, 16));
  return `rgb(${r}, ${g}, ${b})`;
}

function createVisualBytecode({
  effectClass = "HARMONIC",
  glowIntensity = 0.8,
  syllableDepth = 2,
  color = "#66ccff",
} = {}) {
  return {
    effectClass,
    color,
    glowIntensity,
    saturationBoost: 0.3,
    syllableDepth,
    isAnchor: false,
    school: "SONIC",
  };
}

function buildAnalyzedWordsByIdentity(entries) {
  return new Map(
    entries.map((entry) => [
      `${entry.lineIndex}:${entry.wordIndex}:${entry.charStart}`,
      {
        visualBytecode: createVisualBytecode({
          effectClass: entry.effectClass,
          glowIntensity: entry.glowIntensity,
          syllableDepth: entry.syllableDepth,
          color: entry.color,
        }),
        ...entry,
      },
    ])
  );
}

describe("ScrollEditor Truesight overlay", () => {
  const renderWithProviders = (ui) => {
    return render(
      <ThemeProvider>
        {ui}
      </ThemeProvider>
    );
  };

  it("renders one overlay row per document line, including blank lines", () => {
    const content = [
      "The freedom of Defiance",
      "is freedom of a God",
      "",
      "Liberation...",
      "We really need it now",
    ].join("\n");

    const { container } = renderWithProviders(
      <ScrollEditor
        title="Line mapping"
        content={content}
        isEditable={false}
        isTruesight={true}
        analysisMode="rhyme"
        analyzedWords={new Map()}
        activeConnections={[]}
        highlightedLines={[]}
      />
    );

    const overlayLines = container.querySelectorAll(".truesight-line");
    expect(overlayLines.length).toBe(content.split("\n").length);
  });

  it("resets the parchment when a new document identity is issued", () => {
    const view = renderWithProviders(
      <ScrollEditor
        documentIdentity="scroll-1:1"
        title="Old Scroll"
        content="old verse"
        isEditable={true}
      />
    );

    fireEvent.change(view.getByLabelText("Scroll Title"), {
      target: { value: "Mutated Title" },
    });
    fireEvent.change(view.getByLabelText("Scroll content: Mutated Title"), {
      target: { value: "mutated verse" },
    });

    view.rerender(
      <ThemeProvider>
        <ScrollEditor
          documentIdentity="new:2"
          title=""
          content=""
          isEditable={true}
        />
      </ThemeProvider>
    );

    expect(view.getByLabelText("Scroll Title").value).toBe("");
    expect(view.getByLabelText("Scroll content: Untitled").value).toBe("");
  });

  it("reports explicit textarea selections and clears collapsed selections", () => {
    const onSelectionTextChange = vi.fn();
    const view = renderWithProviders(
      <ScrollEditor
        title="Selection bridge"
        content="river bank"
        isEditable={true}
        onSelectionTextChange={onSelectionTextChange}
      />
    );
    const textarea = view.getByLabelText("Scroll content: Selection bridge");

    fireEvent.select(textarea, { target: { selectionStart: 0, selectionEnd: 5 } });
    expect(onSelectionTextChange).toHaveBeenLastCalledWith("river");

    fireEvent.select(textarea, { target: { selectionStart: 5, selectionEnd: 5 } });
    expect(onSelectionTextChange).toHaveBeenLastCalledWith("");
  });

  it("colors content words even when no rhyme connections are active", () => {
    const content = "Alpha beta";
    const analyzedWords = new Map([
      ["ALPHA", { vowelFamily: "AE", syllables: [{}, {}] }],
      ["BETA", { vowelFamily: "EY", syllables: [{}, {}] }],
    ]);

    const { container } = renderWithProviders(
      <ScrollEditor
        title="No connections"
        content={content}
        isEditable={false}
        isTruesight={true}
        analysisMode="rhyme"
        analyzedWords={analyzedWords}
        activeConnections={[]}
        highlightedLines={[]}
      />
    );

    const coloredWords = Array.from(container.querySelectorAll(".grimoire-word")).map((node) => node.textContent);
    expect(coloredWords).toEqual(["Alpha", "beta"]);
  });

  it("colors every non-function content word with Visualiser-style Truesight", () => {
    const content = "Alpha beta gamma";
    const analyzedWordsByIdentity = buildAnalyzedWordsByIdentity([
      { word: "Alpha", normalizedWord: "ALPHA", lineIndex: 0, wordIndex: 0, charStart: 0, charEnd: 5, vowelFamily: "AE" },
      { word: "beta", normalizedWord: "BETA", lineIndex: 0, wordIndex: 1, charStart: 6, charEnd: 10, vowelFamily: "EY" },
      { word: "gamma", normalizedWord: "GAMMA", lineIndex: 0, wordIndex: 2, charStart: 11, charEnd: 16, vowelFamily: "AE" },
    ]);
    const activeConnections = [
      {
        syllablesMatched: 1,
        wordA: { charStart: 0, lineIndex: 0, word: "Alpha", normalizedWord: "ALPHA", vowelFamily: "AE" },
        wordB: { charStart: 11, lineIndex: 0, word: "gamma", normalizedWord: "GAMMA", vowelFamily: "AE" },
      },
    ];

    const { container } = renderWithProviders(
      <ScrollEditor
        title="With connections"
        content={content}
        isEditable={false}
        isTruesight={true}
        analysisMode="rhyme"
        analyzedWordsByIdentity={analyzedWordsByIdentity}
        activeConnections={activeConnections}
        highlightedLines={[]}
      />
    );

    const coloredWords = container.querySelectorAll(".grimoire-word");
    expect(coloredWords.length).toBe(3);
    expect(coloredWords[0]?.textContent).toBe("Alpha");
    expect(coloredWords[1]?.textContent).toBe("beta");
    expect(coloredWords[2]?.textContent).toBe("gamma");
  });

  it("substitutes excluded awkward words through active vowel families", () => {
    const content = "the tone meta";
    const analyzedWordsByIdentity = buildAnalyzedWordsByIdentity([
      {
        word: "the",
        normalizedWord: "THE",
        lineIndex: 0,
        wordIndex: 0,
        charStart: 0,
        charEnd: 3,
        vowelFamily: "EY",
        effectClass: "INERT",
        glowIntensity: 0,
      },
      { word: "tone", normalizedWord: "TONE", lineIndex: 0, wordIndex: 1, charStart: 4, charEnd: 8, vowelFamily: "OW" },
      { word: "meta", normalizedWord: "META", lineIndex: 0, wordIndex: 2, charStart: 9, charEnd: 13, vowelFamily: "EY" },
    ]);
    const activeConnections = [
      {
        syllablesMatched: 1,
        wordA: { charStart: 0, lineIndex: 0, word: "the", normalizedWord: "THE", vowelFamily: "EY" },
        wordB: { charStart: 4, lineIndex: 0, word: "tone", normalizedWord: "TONE", vowelFamily: "OW" },
      },
    ];

    const { container } = renderWithProviders(
      <ScrollEditor
        title="Vowel substitution"
        content={content}
        isEditable={false}
        isTruesight={true}
        analysisMode="rhyme"
        analyzedWordsByIdentity={analyzedWordsByIdentity}
        activeConnections={activeConnections}
        highlightedLines={[]}
      />
    );

    const coloredWords = Array.from(container.querySelectorAll(".grimoire-word")).map((node) => node.textContent);
    expect(coloredWords).toEqual(["tone", "meta"]);
  });

  it("keeps function words neutral while coloring same-family content peers", () => {
    const content = "the echo mellow";
    const analyzedWordsByIdentity = buildAnalyzedWordsByIdentity([
      {
        word: "the",
        normalizedWord: "THE",
        lineIndex: 0,
        wordIndex: 0,
        charStart: 0,
        charEnd: 3,
        vowelFamily: "EH",
        effectClass: "INERT",
        glowIntensity: 0,
      },
      { word: "echo", normalizedWord: "ECHO", lineIndex: 0, wordIndex: 1, charStart: 4, charEnd: 8, vowelFamily: "EH" },
      { word: "mellow", normalizedWord: "MELLOW", lineIndex: 0, wordIndex: 2, charStart: 9, charEnd: 15, vowelFamily: "EH" },
    ]);
    const activeConnections = [
      {
        syllablesMatched: 1,
        wordA: { charStart: 0, lineIndex: 0, word: "the", normalizedWord: "THE", vowelFamily: "EH" },
        wordB: { charStart: 4, lineIndex: 0, word: "echo", normalizedWord: "ECHO", vowelFamily: "EH" },
      },
    ];

    const { container } = renderWithProviders(
      <ScrollEditor
        title="No broad family spill"
        content={content}
        isEditable={false}
        isTruesight={true}
        analysisMode="rhyme"
        analyzedWordsByIdentity={analyzedWordsByIdentity}
        activeConnections={activeConnections}
        highlightedLines={[]}
      />
    );

    const coloredWords = Array.from(container.querySelectorAll(".grimoire-word")).map((node) => node.textContent);
    expect(coloredWords).toEqual(["echo", "mellow"]);
  });

  it("emits stable token identity when a Truesight word is activated", () => {
    const content = "Alpha beta gamma";
    const analyzedWordsByIdentity = buildAnalyzedWordsByIdentity([
      { word: "Alpha", normalizedWord: "ALPHA", lineIndex: 0, wordIndex: 0, charStart: 0, charEnd: 5, vowelFamily: "AE" },
      { word: "beta", normalizedWord: "BETA", lineIndex: 0, wordIndex: 1, charStart: 6, charEnd: 10, vowelFamily: "EY" },
      { word: "gamma", normalizedWord: "GAMMA", lineIndex: 0, wordIndex: 2, charStart: 11, charEnd: 16, vowelFamily: "AE" },
    ]);
    const activeConnections = [
      {
        syllablesMatched: 1,
        wordA: { charStart: 0, lineIndex: 0, word: "Alpha", normalizedWord: "ALPHA", vowelFamily: "AE" },
        wordB: { charStart: 11, lineIndex: 0, word: "gamma", normalizedWord: "GAMMA", vowelFamily: "AE" },
      },
    ];
    const onWordActivate = vi.fn();

    const { container } = renderWithProviders(
      <ScrollEditor
        title="Activation"
        content={content}
        isEditable={false}
        isTruesight={true}
        analysisMode="rhyme"
        analyzedWordsByIdentity={analyzedWordsByIdentity}
        activeConnections={activeConnections}
        highlightedLines={[]}
        onWordActivate={onWordActivate}
      />
    );

    const clickableWord = container.querySelector(".grimoire-word");
    expect(clickableWord).toBeTruthy();

    fireEvent.click(clickableWord);

    expect(onWordActivate).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: "truesight_tap",
        word: "Alpha",
        normalizedWord: "ALPHA",
        charStart: 0,
        lineIndex: 0,
        wordIndex: 0,
        vowelFamily: "AE",
        school: expect.any(String),
        color: expect.any(String),
        anchorRect: expect.objectContaining({
          left: expect.any(Number),
          top: expect.any(Number),
        }),
      })
    );
  });

  it("opens a Truesight word activation even before analysis is available", () => {
    const onWordActivate = vi.fn();

    const { container } = renderWithProviders(
      <ScrollEditor
        title="Lookup before analysis"
        content="dragon"
        isEditable={false}
        isTruesight={true}
        analysisMode="none"
        analyzedWordsByIdentity={new Map()}
        activeConnections={[]}
        highlightedLines={[]}
        onWordActivate={onWordActivate}
      />
    );

    const clickableWord = container.querySelector(".grimoire-word");
    expect(clickableWord).toBeTruthy();

    fireEvent.click(clickableWord);

    expect(onWordActivate).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: "truesight_tap",
        word: "dragon",
        normalizedWord: "DRAGON",
        analysis: null,
        charStart: 0,
        anchorRect: expect.objectContaining({
          left: expect.any(Number),
          top: expect.any(Number),
        }),
      })
    );
  });

  it("draws one pixel-aligned annotation box for each Truesight word", () => {
    const { container } = renderWithProviders(
      <ScrollEditor
        title="Annotation layer"
        content="Alpha beta"
        isEditable={false}
        isTruesight={true}
        analysisMode="none"
        analyzedWordsByIdentity={new Map()}
        activeConnections={[]}
        highlightedLines={[]}
        initialContainerWidth={800}
        forceTopology={{
          baseCellWidth: 10,
          baseCellHeight: 24,
          originX: 20,
          originY: 16,
          totalWidth: 800,
        }}
      />
    );

    const words = Array.from(container.querySelectorAll(".truesight-word"));
    const boxes = Array.from(container.querySelectorAll(".truesight-annotation-box"));

    expect(words.map((node) => node.textContent)).toEqual(["Alpha", "beta"]);
    expect(boxes).toHaveLength(words.length);
    expect(boxes.map((node) => node.getAttribute("data-char-start"))).toEqual(["0", "6"]);
    // The box is a child of its pixel-positioned word shell and fills it via
    // inset - inline left/width here would double-offset it inside the shell.
    boxes.forEach((box) => {
      expect(box.style.position).toBe("absolute");
      expect(box.style.inset).toBe("0");
      expect(box.style.left).toBe("");
      expect(box.style.width).toBe("");
    });
    // The shells carry the pixel positions; the boxes inherit them via inset
    expect(words[0].style.left).toMatch(/^\d+(\.\d+)?px$/);
    expect(words[1].style.left).toMatch(/^\d+(\.\d+)?px$/);
    expect(parseFloat(words[1].style.left)).toBeGreaterThan(parseFloat(words[0].style.left));
  });

  it.each([
    ["EDIT", true],
    ["NEUTRAL", false],
  ])("keeps Truesight word activation reachable when ideMode is %s", (ideMode, isEditable) => {
    const onWordActivate = vi.fn();

    const { container } = renderWithProviders(
      <ScrollEditor
        title="Mode hierarchy"
        content="dragon"
        isEditable={isEditable}
        isTruesight={true}
        ideMode={ideMode}
        analysisMode="none"
        analyzedWordsByIdentity={new Map()}
        activeConnections={[]}
        highlightedLines={[]}
        initialContainerWidth={800}
        forceTopology={{
          baseCellWidth: 10,
          baseCellHeight: 24,
          originX: 20,
          originY: 16,
          totalWidth: 800,
        }}
        onWordActivate={onWordActivate}
      />
    );

    const overlay = container.querySelector(".word-background-layer");
    const clickableWord = container.querySelector(".grimoire-word");
    expect(overlay).toBeTruthy();
    expect(clickableWord).toBeTruthy();

    fireEvent.click(clickableWord);

    expect(onWordActivate).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: "truesight_tap",
        word: "dragon",
        normalizedWord: "DRAGON",
        analysis: null,
        charStart: 0,
      })
    );
  });

  it("uses school colors instead of explicit bytecode colors for multisyllabic rhymes", () => {
    const content = "adore core";
    const willRed = hexToRgbString("#ef4444");
    const divinationGold = hexToRgbString("#eab308");
    const analyzedWordsByIdentity = new Map([
      [
        "0:0:0",
        {
          word: "adore",
          normalizedWord: "ADORE",
          lineIndex: 0,
          wordIndex: 0,
          charStart: 0,
          charEnd: 5,
          vowelFamily: "AH",
          terminalVowelFamily: "AO",
          rhymeKey: "AO-R",
          rhymeTailSignature: "AO-R",
          phonemes: ["AH0", "D", "AO1", "R"],
          visualBytecode: {
            effectClass: "HARMONIC",
            color: "#ff00ff",
            glowIntensity: 0.8,
            saturationBoost: 0.3,
            syllableDepth: 2,
            isAnchor: false,
            school: "SONIC",
          },
        },
      ],
      [
        "0:1:6",
        {
          word: "core",
          normalizedWord: "CORE",
          lineIndex: 0,
          wordIndex: 1,
          charStart: 6,
          charEnd: 10,
          vowelFamily: "AO",
          terminalVowelFamily: "AO",
          rhymeKey: "AO-R",
          rhymeTailSignature: "AO-R",
          phonemes: ["K", "AO1", "R"],
          visualBytecode: {
            effectClass: "HARMONIC",
            color: "#ff00ff",
            glowIntensity: 0.8,
            saturationBoost: 0.3,
            syllableDepth: 1,
            isAnchor: false,
            school: "SONIC",
          },
        },
      ],
    ]);

    const { container } = renderWithProviders(
      <ScrollEditor
        title="Rhyme tail colors"
        content={content}
        isEditable={false}
        isTruesight={true}
        analysisMode="rhyme"
        analyzedWordsByIdentity={analyzedWordsByIdentity}
        activeConnections={[
          {
            syllablesMatched: 1,
            wordA: { charStart: 0, lineIndex: 0, word: "adore", normalizedWord: "ADORE", vowelFamily: "AO" },
            wordB: { charStart: 6, lineIndex: 0, word: "core", normalizedWord: "CORE", vowelFamily: "AO" },
          },
        ]}
        highlightedLines={[]}
      />
    );

    const renderedWords = Array.from(container.querySelectorAll(".truesight-word"));
    expect(renderedWords).toHaveLength(2);
    expect(renderedWords.map((node) => node.textContent)).toEqual(["adore", "core"]);
    expect(window.getComputedStyle(renderedWords[0]).color).toBe(willRed);
    expect(window.getComputedStyle(renderedWords[1]).color).toBe(divinationGold);
  });
});
