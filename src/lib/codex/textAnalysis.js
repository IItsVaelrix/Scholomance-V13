/**
 * Text analysis adapter — re-exports from codex/core text/language modules for UI layer.
 */

// spellcheckContext
export { extractPreviousWord } from '../../../codex/core/spellcheckContext.js';

// spellchecker
export { Spellchecker } from '../../../codex/core/spellchecker.js';

// trie
export { TriePredictor } from '../../../codex/core/trie.js';

// analysis.pipeline
export { analyzeText } from '../../../codex/core/analysis.pipeline.js';

// phonology/phoneme.engine
//
// THE TRANSPORT, NOT THE CORE ENGINE — and re-exported from `engine.adapter.js`
// rather than rebuilt here, because the transport owns the primed cache and a
// second instance would answer every browser lookup with a miss.
//
// This line used to read `from '../../../codex/core/phonology/phoneme.engine.js'`,
// which was the Color Dragon's second door: the adapter was fixed to hand the UI
// a transport while this file went on re-exporting the raw engine to five hooks.
// The core engine has no `getAnalysis`, so `usePredictor` threw the moment it
// asked — and ARCH-0F0E never saw it, because a re-export is not a call.
export { PhonemeEngine } from '../engine.adapter.js';

// microprocessors
export { verseIRMicroprocessors } from '../../../codex/core/microprocessors/index.js';
