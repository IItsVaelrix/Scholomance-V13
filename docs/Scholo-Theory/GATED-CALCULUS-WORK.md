Planted defects, declared before the review. All six are silent — none throws in the shipped suite.

┌─────┬───────────┬────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┬──────────────────────────────────┐
│  #  │ Severity  │                                                                                     Defect                                                                                     │              Proven              │
├─────┼───────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼──────────────────────────────────┤
│ X1  │ Critical  │ Host created in a layout effect keyed [active]; paint effect keyed [highlights] only. Toggle active off→on and the host is recreated but never painted. Overlay blank forever. │ 0 boxes after re-activation      │
│     │           │  exhaustive-deps can't see it — active isn't referenced in the paint effect, and refs are exempt from dep tracking                                                             │                                  │
├─────┼───────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼──────────────────────────────────┤
│ X2  │ Critical  │ hostRef written only inside the layout effect, so between cleanup and next run consumers hold a detached node. Writes go nowhere                                               │ host replaced, new host 0        │
│     │           │                                                                                                                                                                                │ children                         │
├─────┼───────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼──────────────────────────────────┤
│ X3  │ Critical  │ boxMarkup concatenates label into innerHTML unescaped — structural corruption and XSS. Labels come from measured page content                                                  │ <img src=x onerror=…> became a   │
│     │           │                                                                                                                                                                                │ live DOM element                 │
├─────┼───────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼──────────────────────────────────┤
│ X4  │ Important │ MutationObserver watches attributes: true and its callback writes style.left/top — mutating the subtree it observes. Re-entrant storm in a real browser; jsdom's microtask     │ —                                │
│     │           │ timing hides it                                                                                                                                                                │                                  │
├─────┼───────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼──────────────────────────────────┤
│ X5  │ Important │ Cleanup calls document.body.removeChild(host) unconditionally → NotFoundError under StrictMode double-invoke. This repo has documented StrictMode-orphan history               │ —                                │
├─────┼───────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼──────────────────────────────────┤
│ X6  │ Minor     │ Inactive path leaves hostRef.current pointing at a detached host for the component's lifetime                                                                                  │ —                                │
└─────┴───────────┴────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┴──────────────────────────────────┘

Tooling baseline: 9/9 tests green. ESLint's sole complaint is 'React' is defined but never used.

● Agent(Cold review overlay component) Sonnet 5
Done (19 tool uses · 75.6k tokens · 5m 44s)


  Ran 1 shell command

Back on the clean branch. Scoring honestly, including against myself.

Cold review result

Planted: 5 of 6 caught. One of my six wasn't actually a bug.

┌────────────────────────────────┬──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│               #                │                                                                                  Result                                                                                  │
├────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ X1 blank-overlay desync        │ Caught, Critical. Exact sequence reproduced. Went further than I did — noted the legend still reads "N measured surfaces" while zero boxes show, so the UI actively lies │
├────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ X2 stale hostRef               │ Caught, downgraded to Important                                                                                                                                          │
├────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ X3 unescaped innerHTML         │ Caught, downgraded to Important, gave the injection payload shape                                                                                                        │
├────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ X4 re-entrant MutationObserver │ Missed the re-entrancy — but found a deeper bug in the same code (below)                                                                                                 │
├────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ X5 StrictMode removeChild      │ My error, not a miss. host is closed over per-effect-run, so each cleanup removes its own node. Never throws. The reviewer was right not to flag it                      │
├────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ X6 detached host retained      │ Caught                                                                                                                                                                   │
└────────────────────────────────┴──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

The one real miss: the observer writes style.left/top into a subtree it watches with attributes: true, so each write re-triggers the callback — a mutation storm in a real browser, hidden by jsdom's microtask timing.

The part that matters more

It found seven defects I didn't plant — and didn't know were there. Including two Criticals I introduced by accident while building the trap:

- The host div carries none of the protective CSS. position:fixed, pointer-events:none and z-index are all on .measurement-overlay, which in practice wraps only the legend. The host is a separate top-level selector with position:absolute; inset:0 and default pointer-events:auto — an invisible full-document div swallowing every click on the page while active.
- position:absolute against viewport-relative rects → boxes land at wrong offsets under any scroll.

Plus: the observer can't observe page reflow at all (watches only its own subtree — the comment describes behaviour the code cannot produce); highlights={undefined} throws during render; rect fields unvalidated so a missing width silently becomes width:undefinedpx, masking a measurement failure as a zero-size box.

And it went digging unprompted: read src/hooks/useTheme.jsx:29-33 and compose-themes.css, found the app forces data-theme=dark at root unconditionally, and concluded every light-dark() pair in my stylesheet is permanently stuck on its dark branch — the light halves are unreachable code. I never asked it to check theming.

Finally, without being prompted this time, it did the adversarial test read: "Test 8 specifically avoids the one prop-change path that's broken by instead changing highlights with active held constant — the one path that does work."

Verdict on the ultimate test: it passed. Cold prompt, no pathology lens, silent corruption, green suite, ESLint clean — and it blocked the merge, found the bug the author didn't know about, and reasoned about what the tests couldn't see rather than what they asserted.

Both probes are isolated (test/reviewer-adversarial-probe, test/reviewer-dom-corruption-probe); feature/phenotype-measurement-vector is untouched at 80935dd7. Want me to record this second result to memory and delete the probe branches, then run the whole-branch review?

✻ Brewed for 1m 3s

※ recap: We designed and built the Visual Phenotype Calculus measurement vector (7 tasks, all green, orthogonality proven) and just confirmed the code reviewer catches silent DOM corruption cold. Next: delete the two probe branches and run the whole-branch review before merge. (disable recaps in /config)

❯ WOW!!!! It found the most difficult class of UI I could think of!!!!!

It really is the hard class — and it's worth naming exactly why, because the reason is structural rather than about anyone being careless.

Every automated layer is blind to it by construction:

- ESLint / exhaustive-deps — there is literally nothing to see. active is never referenced inside the paint effect, and refs are exempt from dependency tracking. The rule is working correctly and still cannot fire.
- TypeScript — every type is right. A detached node has the same type as an attached one.
- jsdom tests — no layout, no hit-testing, no scroll, no paint order. The two Criticals I introduced by accident live entirely in properties jsdom doesn't model.
- React DevTools — shows a perfectly healthy tree, because the corruption is in nodes React doesn't own.
- Browser Elements panel — the host div is sitting right there looking completely normal. It's just empty.

And the failure mode is absence, not error. Nothing throws. There's no stack to bisect. The overlay simply doesn't paint, which reads to everyone as "that feature isn't wired up yet." That's why this class survives in real codebases for months.

What the reviewer actually did that worked — and this is the transferable part: it didn't check code against a rulebook. It read the stated intent and independently re-derived whether the mechanism produces it. Both accidental Criticals came from one move: the header comment claims the host escapes clipping and stacking contexts → which selector actually carries position:fixed, pointer-events:none, z-index? → a different element entirely. Same move on the observer: the comment says "keep boxes aligned if the page reflows" → what subtree does it observe? → only its own, so it cannot do the thing it says.

Which is precisely the invariant we spent the session designing into the phenotype spec: the claim and the derivation must come from different sources. The reviewer treated comments and test names as claims and the code as the thing to derive from independently. That's the calculus, applied to code review by hand.

The residual blind spot is worth knowing, and it rhymes. The one thing it missed — the re-entrant MutationObserver — is the only defect whose symptom is purely temporal: right DOM state, wrong dynamics, burning CPU. That's the same blind spot we scoped motion out of v1 for, and for the same reason: temporal properties require sampling, not inspection. The review layer and the measurement system fail on the identical axis.