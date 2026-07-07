/**
 * combatBoardTypes.js
 *
 * JSDoc type definitions for the four combat state layers.
 * All board-facing components and hooks reference these shapes.
 *
 * Layers:
 *   1. Combat truth state  — what is actually happening in the battle
 *   2. UI interaction state — the player's current interface posture
 *   3. Derived preview state — ephemeral previews computed from truth + UI
 *   4. Animation playback state — the transient motion queue
 */

// ---------------------------------------------------------------------------
// Coordinates
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} BoardCoord
 * @property {number} x - Column index (0–4, left to right).
 * @property {number} y - Row index (0–4, top to bottom).
 */

// ---------------------------------------------------------------------------
// Tile view model
// ---------------------------------------------------------------------------

/**
 * Compact render model for a single board tile.
 * `BoardTile` (Phaser) receives one of these per tile and nothing else.
 *
 * @typedef {Object} BoardTileViewModel
 * @property {BoardCoord} coord
 * @property {string}     label      - e.g. "B3"
 * @property {boolean}    isOccupied
 * @property {string|null} occupantId
 * @property {boolean}    isCursor   - keyboard cursor is on this tile
 * @property {boolean}    isHovered  - mouse hover
 * @property {boolean}    isSelected - explicit player selection (Phase 2+)
 * @property {boolean}    isReachable  - within move range (Phase 2+)
 * @property {boolean}    isTargetable - valid spell target (Phase 2+)
 * @property {boolean}    isThreatened - enemy attack zone (Phase 2+)
 * @property {boolean}    hasHazard
 * @property {string|null} hazardKind
 * @property {'move'|'spell'|'aoe'|'path'|null} previewKind
 */

// ---------------------------------------------------------------------------
// Rendered unit
// ---------------------------------------------------------------------------

/**
 * Minimal shape the Phaser scene needs to render a combatant.
 *
 * @typedef {Object} RenderedUnit
 * @property {string} id
 * @property {string} name
 * @property {string} school
 * @property {'scholar'|'enemy'|'summon'} side
 * @property {BoardCoord} position
 * @property {'idle'|'moving'|'casting'|'hit'|'defeated'} visualState
 * @property {number} hp
 * @property {number} maxHp
 */

// ---------------------------------------------------------------------------
// UI interaction state
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} CombatUiState
 * @property {'inscribe'|'move'|'channel'|'wait'|'flee'|null} selectedAction
 * @property {BoardCoord|null} cursorTile
 * @property {BoardCoord|null} selectedTile
 * @property {BoardCoord|null} hoveredTile
 * @property {string|null}    selectedUnitId
 * @property {'none'|'move'|'spell'|'inspect'} targetingMode
 */

// ---------------------------------------------------------------------------
// Derived preview state (Phase 2+)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} CombatPreviewState
 * @property {BoardCoord[]} reachableTiles
 * @property {BoardCoord[]} targetableTiles
 * @property {BoardCoord[]} threatenedTiles
 * @property {BoardCoord[]} pathPreview
 * @property {BoardCoord[]} aoeTiles
 * @property {Array}        predictedEffects
 * @property {Object|null}  inspectedTile
 */

// ---------------------------------------------------------------------------
// Animation descriptors (Phase 3+)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} TileFxDescriptor
 * @property {BoardCoord} coord
 * @property {'hoverPulse'|'selectionLock'|'impactFlash'|'hazardBurn'|'resonanceRipple'} fxType
 * @property {number}     durationMs
 * @property {number}     [intensity]
 * @property {string}     [school]
 */

/**
 * @typedef {Object} UnitFxDescriptor
 * @property {string}     unitId
 * @property {'idle'|'move'|'cast'|'hit'|'defeat'} motion
 * @property {BoardCoord} [origin]
 * @property {BoardCoord} [target]
 * @property {number}     durationMs
 * @property {string}     [school]
 */

/**
 * @typedef {Object} BoardAnimationIntent
 * @property {'move'|'cast'|'impact'|'summon'|'statusPulse'|'turnShift'} type
 * @property {string}     [actorId]
 * @property {BoardCoord} [origin]
 * @property {BoardCoord} [target]
 * @property {BoardCoord[]} [affectedTiles]
 * @property {string}     [school]
 * @property {number}     durationMs
 */

/**
 * @typedef {Object} CombatAnimationState
 * @property {BoardAnimationIntent[]} queue
 * @property {BoardAnimationIntent|null} active
 * @property {BoardAnimationIntent|null} lastCompleted
 */
