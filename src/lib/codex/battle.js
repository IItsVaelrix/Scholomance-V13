/**
 * Battle adapter — re-exports from codex/core battle modules for UI layer.
 */

// battle.schemas
export * from '../../../codex/core/battle.schemas.js';

// combat.balance
export * from '../../../codex/core/combat.balance.js';

// combat.session
export * from '../../../codex/core/combat.session.js';

// opponent.engine
export * from '../../../codex/core/opponent.engine.js';

// combat.syntax-chess
export { evaluateSyntacticalChess } from '../../../codex/core/combat.syntax-chess.js';

// combat.scoring
export { normalizeCombatScore } from '../../../codex/core/combat.scoring.js';

// scoring.defaults
export { createCombatScoringEngine } from '../../../codex/core/scoring.defaults.js';
