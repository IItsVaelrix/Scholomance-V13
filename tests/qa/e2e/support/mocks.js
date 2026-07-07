function fulfillJson(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function buildWordAnalyses(text) {
  const analyses = [];
  const lineSyllableCounts = [];
  const lines = String(text || "").split("\n");
  let documentOffset = 0;
  const vowelFamilies = ["EH", "IY", "OW", "AY", "UW"];

  lines.forEach((line, lineIndex) => {
    const matches = [...line.matchAll(/\b[A-Za-z']+\b/g)];
    lineSyllableCounts.push(Math.max(1, matches.length * 2));

    matches.forEach((match, wordIndex) => {
      const word = match[0];
      const charStart = documentOffset + (match.index ?? 0);
      analyses.push({
        word,
        normalizedWord: word.toUpperCase(),
        lineIndex,
        wordIndex,
        charStart,
        charEnd: charStart + word.length,
        vowelFamily: vowelFamilies[wordIndex % vowelFamilies.length],
        syllableCount: Math.min(4, Math.max(1, Math.ceil(word.length / 3))),
        rhymeKey: `${word.slice(-2).toUpperCase()}-${word.length}`,
        stressPattern: "10",
        role: wordIndex === 0 ? "content" : "function",
        lineRole: wordIndex === 0 ? "line_start" : "line_mid",
        stressRole: wordIndex === 0 ? "primary" : "unstressed",
        rhymePolicy: "allow",
      });
    });

    documentOffset += line.length + 1;
  });

  return { analyses, lineSyllableCounts };
}

function buildPanelAnalysisResponse(text) {
  const { analyses, lineSyllableCounts } = buildWordAnalyses(text);
  const [firstWord, secondWord = firstWord] = analyses;

  return {
    source: "server-analysis",
    data: {
      analysis: {
        allConnections: firstWord && secondWord
          ? [
              {
                type: "assonance",
                score: 0.92,
                groupLabel: "A",
                wordA: {
                  word: firstWord.word,
                  lineIndex: firstWord.lineIndex,
                  charStart: firstWord.charStart,
                },
                wordB: {
                  word: secondWord.word,
                  lineIndex: secondWord.lineIndex,
                  charStart: secondWord.charStart,
                },
              },
            ]
          : [],
        rhymeGroups: [["A", [0]]],
        syntaxSummary: {
          enabled: true,
          tokenCount: analyses.length,
          roleCounts: { content: 1, function: Math.max(0, analyses.length - 1) },
          lineRoleCounts: { line_start: 1, line_mid: Math.max(0, analyses.length - 1), line_end: 0 },
          stressRoleCounts: { primary: 1, secondary: 0, unstressed: Math.max(0, analyses.length - 1), unknown: 0 },
          rhymePolicyCounts: { allow: analyses.length, allow_weak: 0, suppress: 0 },
          reasonCounts: { mock: analyses.length },
          tokens: analyses.map((entry) => ({
            word: entry.word,
            normalized: entry.normalizedWord.toLowerCase(),
            lineNumber: entry.lineIndex,
            wordIndex: entry.wordIndex,
            charStart: entry.charStart,
            charEnd: entry.charEnd,
            role: entry.role,
            lineRole: entry.lineRole,
            stressRole: entry.stressRole,
            rhymePolicy: entry.rhymePolicy,
            reasons: ["mock analysis"],
          })),
        },
        wordAnalyses: analyses,
        lineSyllableCounts,
        statistics: {
          lineCount: lineSyllableCounts.length,
          wordCount: analyses.length,
        },
      },
      scheme: {
        id: "paired",
        label: "Paired",
        groups: [["A", [0]]],
      },
      meter: {
        label: "Accentual Hex",
        confidence: 0.74,
      },
      literaryDevices: [],
      emotion: "Focused",
      scoreData: {
        totalScore: 68,
        traces: [
          { heuristic: "rhyme_density", contribution: 24 },
          { heuristic: "alliteration", contribution: 18 },
        ],
        plsPhoneticFeatures: {
          rhymeAffinityScore: 0.84,
          constellationDensity: 0.73,
          internalRecurrenceScore: 0.61,
          phoneticNoveltyScore: 0.57,
        },
      },
      genreProfile: {
        name: "Incantation",
      },
      vowelSummary: {
        families: analyses.map((entry) => ({
          id: entry.vowelFamily,
          count: 1,
        })),
        totalWords: analyses.length,
        uniqueWords: new Set(analyses.map((entry) => entry.normalizedWord)).size,
      },
      rhymeAstrology: {
        enabled: true,
        features: {
          rhymeAffinityScore: 0.84,
          constellationDensity: 0.73,
          internalRecurrenceScore: 0.61,
          phoneticNoveltyScore: 0.57,
        },
        inspector: {
          anchors: firstWord
            ? [
                {
                  word: firstWord.word,
                  normalizedWord: firstWord.normalizedWord,
                  lineIndex: firstWord.lineIndex,
                  wordIndex: firstWord.wordIndex,
                  charStart: firstWord.charStart,
                  charEnd: firstWord.charEnd,
                  sign: "Echo Weave",
                  dominantVowelFamily: firstWord.vowelFamily,
                  tokenId: 0,
                  activeWindowIds: [0],
                  compilerRef: null,
                  topMatches: [
                    {
                      nodeId: "mock-node-1",
                      token: secondWord?.word || firstWord.word,
                      overallScore: 0.86,
                      reasons: ["shared resonance", "terminal echo"],
                    },
                  ],
                  constellations: [],
                  diagnostics: {
                    queryTimeMs: 4,
                    cacheHit: true,
                    candidateCount: 2,
                  },
                },
              ]
            : [],
          clusters: [
            {
              id: "cluster-a",
              label: "Echo Weave",
              anchorWord: firstWord?.word || "",
              sign: "Echo Weave",
              dominantVowelFamily: [firstWord?.vowelFamily || "EH"],
              dominantStressPattern: "10",
              densityScore: 0.78,
              cohesionScore: 0.74,
              membersCount: Math.max(1, analyses.length),
            },
          ],
          windows: [],
          spans: [],
        },
        diagnostics: {
          anchorCount: firstWord ? 1 : 0,
          cacheHitCount: 1,
          averageQueryTimeMs: 4,
        },
      },
      oracle: null,
    },
  };
}

function buildLookupPayload(word) {
  const normalized = String(word || "").trim().toUpperCase();
  const titleCase = normalized.charAt(0) + normalized.slice(1).toLowerCase();

  return {
    data: {
      word: titleCase,
      definition: {
        text: "A reflected sound preserved by the chamber.",
        partOfSpeech: "noun",
        source: "mock-codex",
      },
      definitions: [
        "A reflected sound preserved by the chamber.",
        "A recurrence that returns with altered force.",
      ],
      synonyms: ["reverb", "resonance"],
      antonyms: ["silence"],
      rhymes: ["gecko", "retro"],
      slantRhymes: ["ember"],
      rhymeKey: "EH-KOW",
      syllableCount: 2,
      ipa: "EH-koh",
      vowelFamily: "EH",
    },
    source: "mock-codex",
  };
}

function buildProgressionPayload(overrides = {}) {
  return {
    xp: 0,
    unlockedSchools: ["SONIC"],
    lastUpdated: 1711660800000,
    achievements: [],
    discoveryHistory: [],
    nexus: {
      discoveredWords: {},
      activeSynergies: [],
    },
    ...overrides,
  };
}

export async function installGuestSessionMocks(page) {
  await page.route("**/auth/csrf-token", (route) =>
    fulfillJson(route, { token: "test-csrf-token" })
  );
  await page.route("**/auth/me", (route) =>
    fulfillJson(route, { message: "Unauthorized" }, 401)
  );
  await page.route("**/auth/logout", (route) =>
    fulfillJson(route, { success: true })
  );
  await page.route("**/api/progression", (route) => {
    const method = route.request().method();
    if (method === "GET") {
      return fulfillJson(route, { message: "Unauthorized" }, 401);
    }
    return fulfillJson(route, { message: "Unauthorized" }, 401);
  });
}

export async function installReadPageMocks(page) {
  await installGuestSessionMocks(page);
  await page.goto('/');
  await page.evaluate(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('scholomance.user.settings.v1') || '{}');
      stored.truesightEnabled = true;
      localStorage.setItem('scholomance.user.settings.v1', JSON.stringify(stored));
    } catch {
      // Ignore localStorage errors during mock installation
    }
  });

  await page.route("**/api/analysis/panels", (route) => {
    const payload = route.request().postDataJSON?.() ?? {};
    return fulfillJson(route, buildPanelAnalysisResponse(payload.text || ""));
  });

  await page.route("**/api/word-lookup/*", (route) => {
    const url = new URL(route.request().url());
    const word = decodeURIComponent(url.pathname.split("/").pop() || "");
    return fulfillJson(route, buildLookupPayload(word));
  });
}

export async function installAuthFlowMocks(page, credentials) {
  const registered = {
    username: credentials.username,
    email: credentials.email,
    password: credentials.password,
  };
  let currentUser = null;

  await page.route("**/auth/csrf-token", (route) =>
    fulfillJson(route, { token: "test-csrf-token" })
  );
  await page.route("**/auth/captcha", (route) =>
    fulfillJson(route, { id: "captcha-1", text: "3 + 4" })
  );
  await page.route("**/auth/register", async (route) => {
    const payload = route.request().postDataJSON();
    const isValidCaptcha = payload?.captchaId === "captcha-1" && String(payload?.captchaAnswer).trim() === "7";
    if (!isValidCaptcha) {
      return fulfillJson(route, { message: "Invalid security challenge." }, 400);
    }

    registered.username = payload.username;
    registered.email = payload.email;
    registered.password = payload.password;

    return fulfillJson(route, {
      success: true,
      message: "Registration successful! Check your email to verify your account.",
    });
  });
  await page.route("**/auth/login", async (route) => {
    const payload = route.request().postDataJSON();
    const isValidLogin =
      payload?.username === registered.username &&
      payload?.password === registered.password;

    if (!isValidLogin) {
      return fulfillJson(route, { message: "Invalid credentials." }, 401);
    }

    currentUser = {
      id: 7,
      username: registered.username,
      email: registered.email,
    };

    return fulfillJson(route, { success: true });
  });
  await page.route("**/auth/me", (route) => {
    if (!currentUser) {
      return fulfillJson(route, { message: "Unauthorized" }, 401);
    }
    return fulfillJson(route, { user: currentUser });
  });
  await page.route("**/auth/logout", (route) => {
    currentUser = null;
    return fulfillJson(route, { success: true });
  });
  await page.route("**/api/progression", async (route) => {
    if (!currentUser) {
      return fulfillJson(route, { message: "Unauthorized" }, 401);
    }

    const method = route.request().method();
    if (method === "GET") {
      return fulfillJson(route, buildProgressionPayload({ xp: 120 }));
    }
    if (method === "POST") {
      const payload = route.request().postDataJSON?.() ?? {};
      return fulfillJson(
        route,
        buildProgressionPayload({
          xp: payload.xp ?? 120,
          unlockedSchools: payload.unlockedSchools ?? ["SONIC"],
          lastUpdated: 1711660801000,
        })
      );
    }
    if (method === "DELETE") {
      return fulfillJson(route, buildProgressionPayload());
    }

    return fulfillJson(route, { message: `Unsupported method ${method}` }, 405);
  });
}

export async function installCombatMocks(page) {
  await installGuestSessionMocks(page);
  await page.unroute("**/api/progression");
  await page.route("**/api/progression", (route) =>
    fulfillJson(route, buildProgressionPayload({ xp: 240 }))
  );

  await page.route("**/api/combat/score", (route) =>
    fulfillJson(route, {
      damage: 42,
      healing: 6,
      totalScore: 91,
      school: "SONIC",
      arenaSchool: "SONIC",
      opponentSchool: "SONIC",
      commentary: "A mock resonance tears through the chamber.",
      traces: [
        { heuristic: "rhyme_density", contribution: 46 },
        { heuristic: "alliteration", contribution: 28 },
      ],
      explainTrace: [
        { heuristic: "rhyme_density", contribution: 46 },
        { heuristic: "alliteration", contribution: 28 },
      ],
      intent: {
        healing: true,
        terrain: false,
        buff: false,
        debuff: false,
        failureDisposition: "NEUTRAL",
      },
      failureCast: false,
      verseIR: {
        verseIRAmplifier: {
          dominantTier: "RARE",
          noveltySignal: 0.62,
          semanticDepth: 0.48,
          impactMultiplier: 1.08,
        },
        tokens: [],
        lines: [],
      },
    })
  );
}

export async function emitCombatBridgeEvent(page, eventName, payload) {
  await page.waitForFunction(() => Boolean(window.__SCHOLOMANCE_COMBAT_BRIDGE__), null, {
    timeout: 15000,
  });
  await page.evaluate(
    async ({ eventName: nextEventName, payload: nextPayload }) => {
      const bridge =
        window.__SCHOLOMANCE_COMBAT_BRIDGE__ ||
        (await import("/src/pages/Combat/combatBridge.js")).combatBridge;
      bridge.emit(nextEventName, nextPayload);
    },
    { eventName, payload }
  );
}
