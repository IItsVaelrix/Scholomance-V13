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
export { PhonemeEngine } from '../../../codex/core/phonology/phoneme.engine.js';

// microprocessors
export { verseIRMicroprocessors } from '../../../codex/core/microprocessors/index.js';
