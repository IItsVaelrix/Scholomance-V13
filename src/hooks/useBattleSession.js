/**
 * useBattleSession.js
 *
 * Tactical battle orchestration powered by canonical combat scoring.
 * Player casts resolve through VerseIR amplification + combat profile
 * normalization, and opponents answer with deterministic counter-verses.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  createEmptyGrid,
  INITIAL_GRID_SIZE,
  createCombatOpponent,
  generateOpponentSpell,
  createCombatScoringEngine,
  normalizeCombatScore,
  evaluateSyntacticalChess,
  OPPONENT_MAX_HP,
  PLAYER_MAX_HP,
  splitCombatLines,
  upsertStatusEffect as mergeStatusEffects,
  tickStatusEffects,
  getStatusMagnitude,
  BASE_MP_REGEN,
  computeCombatManaRegen,
} from '../lib/codex/battle.js';
import { analyzeText } from '../lib/codex/textAnalysis.js';
import { scoreCombatScroll } from '../lib/combatApi.js';
import {
  generateBattleLeylines,
  scoreExtraction,
  getLeylinePhase,
  computeLinguisticCoherence,
} from '../lib/codex/leyline.js';

import { useProgression } from './useProgression.jsx';


const PLAYER_ID = 'player';
const OPPONENT_ID = 'opponent';
const TURN_TIME_SECONDS = 90;
const CAST_MP_COST = 10;
const BASE_CHANNEL_MP = 20;
const RESONANCE_CHARGE_ID = 'RESONANCE_CHARGE';

function stableHash(value) {
  const text = String(value || '');
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash) + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function createSeededRandom(seed) {
  let state = (Math.abs(Number(seed) || 1) % 2147483646) + 1;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function clampBetween(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function applyPlayerTurnStartRecovery(entity, { mpDrain = 0, damage = 0 } = {}) {
  const passiveRegen = computeCombatManaRegen(entity.lastScoreData, {
    baseRegen: BASE_MP_REGEN,
  });
  const restorativeRegen = Math.round(getStatusMagnitude(entity, 'restorative_regimen'));

  return {
    ...entity,
    hp: clampBetween(entity.hp - damage + restorativeRegen, 0, entity.maxHp),
    mp: clampBetween(entity.mp - mpDrain + passiveRegen, 0, entity.maxMp),
    statusEffects: tickStatusEffects(entity.statusEffects),
  };
}

function createEffectRecord(type, school, magnitude, x, y, slot) {
  return {
    id: `effect-${type}-${x}-${y}-${slot}`,
    type,
    school,
    magnitude: Number(magnitude.toFixed(3)),
    duration: -1,
  };
}

function seedBattlefieldEffects(grid, battleSeed, occupied = new Set()) {
  const random = createSeededRandom(battleSeed);
  const lanePlans = [
    { rows: [5, 6, 7, 8], type: 'RESONANCE_BUFF', school: 'SONIC', slots: 2 },
    { rows: [0, 1, 2, 3], type: 'POISON_SNARE', school: 'VOID', slots: 2 },
  ];

  lanePlans.forEach((lane, laneIndex) => {
    for (let slot = 0; slot < lane.slots; slot += 1) {
      let attempts = 0;
      while (attempts < 20) {
        attempts += 1;
        const x = Math.floor(random() * INITIAL_GRID_SIZE);
        const y = lane.rows[Math.floor(random() * lane.rows.length)];
        const key = `${x},${y}`;
        const cell = grid?.[y]?.[x];
        if (!cell || occupied.has(key) || cell.fieldEffect) continue;

        cell.fieldEffect = createEffectRecord(
          lane.type,
          lane.school,
          0.45 + (random() * 0.4),
          x,
          y,
          `${laneIndex}-${slot}`
        );
        occupied.add(key);
        break;
      }
    }
  });
}


function buildScoreBadges({
  school,
  rarity,
  speechAct,
  bridgeIntent,
  dominantArchetype,
  dominantTier,
}) {
  return [
    school ? `${school}` : null,
    rarity ? `${String(rarity).toUpperCase()}` : null,
    speechAct ? `${String(speechAct).toUpperCase()} ACT` : null,
    bridgeIntent ? `${String(bridgeIntent).toUpperCase()} WEAVE` : null,
    dominantArchetype ? `${String(dominantArchetype).toUpperCase()}` : null,
    dominantTier ? `${String(dominantTier).toUpperCase()} TIER` : null,
  ].filter(Boolean);
}

function uniqueCells(cells, width, height) {
  const seen = new Set();
  return (Array.isArray(cells) ? cells : []).filter((cell) => {
    if (!cell) return false;
    if (cell.x < 0 || cell.x >= width || cell.y < 0 || cell.y >= height) return false;
    const key = `${cell.x},${cell.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getTileResonanceMultiplier(cell) {
  const fieldEffect = cell?.fieldEffect;
  if (!fieldEffect) return 1;
  if (fieldEffect.type === 'RESONANCE_BUFF') {
    return 1 + (Number(fieldEffect.magnitude) || 0);
  }
  if (fieldEffect.type === 'POISON_SNARE') {
    return Math.max(0.55, 1 - ((Number(fieldEffect.magnitude) || 0) * 0.65));
  }
  return 1;
}

function buildPlayerCastSummary(scoreData, verseIRAmplifier) {
  const amplifier = verseIRAmplifier || scoreData?.verseIRAmplifier || null;
  const chessState = scoreData?.syntacticalChess?.state || null;

  return {
    totalScore: Number(scoreData?.totalScore) || 0,
    school: scoreData?.school || null,
    rarity: scoreData?.rarity?.label || null,
    speechAct: scoreData?.intent?.speechAct || null,
    bridgeIntent: scoreData?.bridge?.intent || null,
    dominantArchetype: amplifier?.dominantArchetype?.label || null,
    dominantTier: amplifier?.dominantTier || null,
    syntacticalChess: scoreData?.syntacticalChess || null,
    badges: buildScoreBadges({
      school: scoreData?.school,
      rarity: scoreData?.rarity?.label,
      speechAct: scoreData?.intent?.speechAct,
      bridgeIntent: scoreData?.bridge?.intent,
      dominantArchetype: amplifier?.dominantArchetype?.label,
      dominantTier: amplifier?.dominantTier,
    }).concat(chessState === 'advantage'
      ? ['SYNTACTICAL ADVANTAGE']
      : chessState === 'disadvantage'
        ? ['SYNTACTICAL DISADVANTAGE']
        : []),
  };
}

function buildOpponentSummary(opponentSpell) {
  return {
    totalScore: null,
    school: opponentSpell?.school || null,
    rarity: opponentSpell?.rarity?.label || null,
    speechAct: opponentSpell?.intent?.speechAct || null,
    bridgeIntent: null,
    dominantArchetype: null,
    dominantTier: null,
    badges: buildScoreBadges({
      school: opponentSpell?.school,
      rarity: opponentSpell?.rarity?.label,
      speechAct: opponentSpell?.intent?.speechAct,
      dominantArchetype: opponentSpell?.signatureMove?.name,
    }),
  };
}

function buildPlayerNarrative({
  scoreData,
  damageMap,
  latticePrefix,
  chargeMultiplier,
}) {
  const summary = [];
  if (latticePrefix) summary.push(latticePrefix);
  if ((chargeMultiplier || 1) > 1) {
    summary.push('The resonance charge opens the line wider.');
  }
  if (scoreData?.commentary) {
    summary.push(scoreData.commentary);
  }

  damageMap.forEach((entry) => {
    if (entry.amount < 0) {
      summary.push(`${entry.targetName} recovers ${Math.abs(entry.amount)} essence.`);
    } else if (entry.amount > 0) {
      summary.push(`${entry.targetName} suffers ${entry.amount} damage.`);
    }
  });

  return summary.join(' ');
}

function buildTurnResult(base) {
  const timestamp = Date.now(); // EXEMPT
  const digest = stableHash([
    base?.entityId,
    base?.actionType,
    base?.spellText,
    base?.narrativeLog,
    base?.commentary,
  ].join('|')).toString(16);

  return {
    id: `turn-${timestamp}-${digest}`,
    timestamp,
    affectedCells: [],
    damageMap: [],
    traces: [],
    explainTrace: [],
    ...base,
  };
}

function getPreferredRangeBand(opponentSpell) {
  const preferred = opponentSpell?.telegraph?.preferredRange;
  if (preferred?.min != null && preferred?.max != null) {
    return preferred;
  }
  return { min: 2, max: 3 };
}

function chooseOpponentMove({ battleState, opponent, player, opponentSpell }) {
  const mov = opponent.mov || 2;
  const preferredRange = getPreferredRangeBand(opponentSpell);
  let bestMove = opponent.position;
  let bestScore = -Infinity;

  for (let dy = -mov; dy <= mov; dy += 1) {
    for (let dx = -mov; dx <= mov; dx += 1) {
      const x = opponent.position.x + dx;
      const y = opponent.position.y + dy;
      const distanceTravelled = Math.abs(dx) + Math.abs(dy);
      if (x < 0 || x >= battleState.gridWidth || y < 0 || y >= battleState.gridHeight) continue;
      if (distanceTravelled > mov) continue;

      const destinationCell = battleState.grid?.[y]?.[x];
      if (!destinationCell) continue;
      if (destinationCell.occupantId && !(x === opponent.position.x && y === opponent.position.y)) continue;

      const distanceToPlayer = Math.abs(x - player.position.x) + Math.abs(y - player.position.y);
      let score = 0;

      if (distanceToPlayer < preferredRange.min) {
        score -= (preferredRange.min - distanceToPlayer) * 6;
      } else if (distanceToPlayer > preferredRange.max) {
        score -= (distanceToPlayer - preferredRange.max) * 4;
      } else {
        score += 14;
      }

      if (destinationCell.fieldEffect?.type === 'RESONANCE_BUFF') {
        score += 8 + Math.round((Number(destinationCell.fieldEffect.magnitude) || 0) * 10);
      }
      if (destinationCell.fieldEffect?.type === 'POISON_SNARE') {
        score -= 8 + Math.round((Number(destinationCell.fieldEffect.magnitude) || 0) * 10);
      }

      if (opponentSpell?.signatureMove?.type === 'TOKEN_THEFT') {
        score -= distanceToPlayer * 1.2;
      } else if (opponentSpell?.signatureMove?.type === 'TELEGRAPH') {
        score += distanceToPlayer;
      }

      score -= distanceTravelled * 0.5;
      score -= stableHash(`${battleState.id}:${x}:${y}:${opponentSpell?.signatureMove?.type || 'none'}`) / 1000000;

      if (score > bestScore) {
        bestScore = score;
        bestMove = { x, y };
      }
    }
  }

  return bestMove;
}

async function resolvePlayerCombatProfile({
  verse,
  weave,
  arenaSchool,
  opponentSchool,
  opponent,
  scoringEngine,
  speakerProfile,
}) {
  try {
    const apiScoreData = await scoreCombatScroll({
      scrollText: verse,
      weave,
      arenaSchool,
      opponentSchool,
    });

    const syntacticalChess = evaluateSyntacticalChess({
      phrase: verse,
      enemy: opponent,
      verseIR: apiScoreData.verseIR || apiScoreData.verseIRAmplifier || null,
      profile: apiScoreData,
    });
    const enrichedScoreData = apiScoreData?.syntacticalChess
      ? apiScoreData
      : {
          ...apiScoreData,
          damage: Math.max(1, Math.round((Number(apiScoreData.damage) || 0) * syntacticalChess.multiplier)),
          syntacticalChess,
          syntacticalChessMultiplier: syntacticalChess.multiplier,
          commentary: [apiScoreData.commentary || '', ...syntacticalChess.diagnostics].filter(Boolean).join(' '),
        };

    return {
      analyzedDoc: null,
      verseIR: enrichedScoreData.verseIR || null,
      scoreData: enrichedScoreData,
    };
  } catch (error) {
    console.warn('[useBattleSession] Combat score API failed, falling back to local combat scoring.', error);
  }

  const analyzedDoc = analyzeText(verse);
  const baseScoreData = await scoringEngine.calculateScore(analyzedDoc);
  const scoreData = normalizeCombatScore(
    baseScoreData,
    {
      scrollText: verse,
      weave,
      arenaSchool,
      opponentSchool,
      analyzedDoc,
      speakerId: `combat:${PLAYER_ID}`,
      speakerType: 'PLAYER',
      speakerProfile,
      defender: opponent,
    }
  );

  // CONNECTIVE TISSUE: propagate tokenWeights so that any PLS-driven
  // completion requests made during battle use the same document-importance
  // weights as the main scroll editor. Without this, the battle fallback
  // path discards the second-pass weights that analysis.pipeline stamps.
  const tokenWeights = analyzedDoc.parsed?.tokenWeights ?? null;

  return {
    analyzedDoc,
    verseIR: scoreData?.verseIR || (scoreData?.verseIRAmplifier ? { verseIRAmplifier: scoreData.verseIRAmplifier } : null),
    scoreData: tokenWeights ? { ...scoreData, tokenWeights } : scoreData,
  };
}

function applyDamageEntry(entity, entry) {
  if (!entry) return entity;
  const maxHp = entity.id === PLAYER_ID ? PLAYER_MAX_HP : OPPONENT_MAX_HP;
  return {
    ...entity,
    hp: clampBetween(entity.hp - entry.amount, 0, maxHp),
  };
}

export function useBattleSession() {
  const [battleState, setBattleState] = useState(null);
  const [isResolving, setIsResolving] = useState(false);
  const [turnTimeRemaining, setTurnTimeRemaining] = useState(TURN_TIME_SECONDS);
  const timerRef = useRef(null);
  const scoringEngineRef = useRef(null);
  const { recordWordUse } = useProgression();

  if (!scoringEngineRef.current) {
    scoringEngineRef.current = createCombatScoringEngine();
  }

  const startBattle = useCallback((archetypeId) => {
    const opponentData = createCombatOpponent({
      id: archetypeId,
      random: createSeededRandom(stableHash(archetypeId)),
    });
    const battleSeed = stableHash(`${archetypeId}:${opponentData.name}:${opponentData.school}`);
    const arenaSchool = opponentData.school || 'SONIC';

    let playerName = 'Scholar';
    try {
      const actorData = localStorage.getItem('scholomance_active_actor');
      if (actorData) {
        const parsed = JSON.parse(actorData);
        if (parsed?.displayName) playerName = parsed.displayName;
      }
    } catch (e) {
      // ignore
    }

    const player = {
      id: PLAYER_ID,
      name: playerName,
      school: 'SONIC',
      hp: 1000,
      maxHp: 1000,
      mp: 100,
      maxMp: 100,
      position: { x: 4, y: 7 },
      orientation: 0,
      status: 'online',
      statusEffects: [],
      mov: 2,
      range: 2,
      movesRemaining: 1,
      maxMovesPerTurn: 1,
      bytecodeEffectClass: 'RESONANT',
      glowIntensity: 0.5,
      voiceProfile: null,
      lastScoreSummary: null,
      stats: {
        SYNT: 10,
        META: 10,
        MYTH: 10,
        VIS: 10,
        PSYC: 10,
        CODEX: 10,
        INT: 10,
      },
    };

    const opponent = {
      id: OPPONENT_ID,
      name: opponentData.name,
      subtitle: opponentData.subtitle,
      description: opponentData.subtitle,
      school: opponentData.school,
      doctrine: opponentData.doctrine || null,
      syntacticProfile: opponentData.syntacticProfile || null,
      hp: 1500,
      maxHp: 1500,
      mp: 100,
      maxMp: 100,
      position: { x: 4, y: 1 },
      orientation: 180,
      status: 'online',
      statusEffects: [],
      int: opponentData.int,
      mov: 2,
      range: 3,
      movesRemaining: 1,
      maxMovesPerTurn: 1,
      bytecodeEffectClass: 'RESONANT',
      glowIntensity: 0.5,
      voiceProfile: opponentData.voiceProfile || null,
      telegraph: null,
      signatureMove: null,
      counterTokens: [],
      lastScoreSummary: null,
      stats: {
        SYNT: opponentData.stats?.SYNT || 12,
        META: opponentData.stats?.META || 12,
        MYTH: opponentData.stats?.MYTH || 12,
        VIS: opponentData.stats?.VIS || 12,
        PSYC: opponentData.stats?.PSYC || 12,
        CODEX: opponentData.stats?.CODEX || 12,
        INT: opponentData.int || 12,
      },
    };

    const grid = createEmptyGrid();
    grid[player.position.y][player.position.x].occupantId = PLAYER_ID;
    grid[opponent.position.y][opponent.position.x].occupantId = OPPONENT_ID;
    seedBattlefieldEffects(
      grid,
      battleSeed,
      new Set([
        `${player.position.x},${player.position.y}`,
        `${opponent.position.x},${opponent.position.y}`,
      ])
    );

    const leylines = generateBattleLeylines({
      battleSeed,
      width: INITIAL_GRID_SIZE,
      height: INITIAL_GRID_SIZE,
      blockedCoords: [player.position, opponent.position],
      count: 3
    });

    let battleIdCounter = 0;
    setBattleState({
      id: `battle-${battleIdCounter++}`, // EXEMPT
      gridWidth: INITIAL_GRID_SIZE,
      gridHeight: INITIAL_GRID_SIZE,
      grid,
      entities: [player, opponent],
      activeEntityId: PLAYER_ID,
      round: 1,
      phase: 'player_writing',
      history: [],
      leylines,
      spentLeylineIds: [],
      playerTurnIndex: 1,
      metadata: {
        battleSeed,
        arenaSchool,
        atmosphereIntensity: 0.4,
      },
    });
    setTurnTimeRemaining(TURN_TIME_SECONDS);
  }, []);

  const moveEntity = useCallback((delta) => {
    setBattleState((prev) => {
      if (!prev || prev.activeEntityId !== PLAYER_ID) return prev;
      const player = prev.entities.find((entity) => entity.id === PLAYER_ID);
      if (!player || player.movesRemaining <= 0) return prev;

      const nextX = clampBetween(player.position.x + delta.dx, 0, prev.gridWidth - 1);
      const nextY = clampBetween(player.position.y + delta.dy, 0, prev.gridHeight - 1);
      const distance = Math.abs(nextX - player.position.x) + Math.abs(nextY - player.position.y);

      if (distance > (player.mov || 2)) return prev;
      if (prev.grid?.[nextY]?.[nextX]?.occupantId) return prev;

      const nextEntities = prev.entities.map((entity) => (
        entity.id === PLAYER_ID
          ? {
            ...entity,
            position: { x: nextX, y: nextY },
            movesRemaining: Math.max(0, entity.movesRemaining - 1),
          }
          : entity
      ));
      const nextGrid = prev.grid.map((row) => row.map((cell) => ({
        ...cell,
        occupantId: null,
      })));
      nextEntities.forEach((entity) => {
        nextGrid[entity.position.y][entity.position.x].occupantId = entity.id;
      });

      return {
        ...prev,
        entities: nextEntities,
        grid: nextGrid,
      };
    });
  }, []);

  const handOffTurnToOpponent = useCallback((turnResult, entityUpdater) => {
    setBattleState((prev) => {
      if (!prev) return prev;
      const nextEntities = prev.entities.map((entity) => {
        const updated = entityUpdater ? entityUpdater(entity, prev) : entity;
        if (updated.id === PLAYER_ID) {
          return {
            ...updated,
            movesRemaining: updated.maxMovesPerTurn,
          };
        }
        if (updated.id === OPPONENT_ID) {
          return {
            ...updated,
            movesRemaining: updated.maxMovesPerTurn,
          };
        }
        return updated;
      });

      const player = nextEntities.find(e => e.id === PLAYER_ID);
      const opponent = nextEntities.find(e => e.id === OPPONENT_ID);
      let phase = 'opponent_responding';
      if (opponent && opponent.hp <= 0) {
        phase = 'victory';
      } else if (player && player.hp <= 0) {
        phase = 'defeat';
      }

      const nextGrid = prev.grid.map((row) => row.map((cell) => ({
        ...cell,
        occupantId: null,
      })));
      nextEntities.forEach((entity) => {
        nextGrid[entity.position.y][entity.position.x].occupantId = entity.id;
      });

      return {
        ...prev,
        entities: nextEntities,
        grid: nextGrid,
        phase,
        activeEntityId: phase === 'opponent_responding' ? OPPONENT_ID : PLAYER_ID,
        history: [...prev.history, turnResult],
      };
    });
  }, []);

  const channelEnergy = useCallback(() => {
    if (!battleState || battleState.activeEntityId !== PLAYER_ID) return null;

    const player = battleState.entities.find((entity) => entity.id === PLAYER_ID);
    const currentTile = battleState.grid?.[player.position.y]?.[player.position.x];
    const latticeMultiplier = getTileResonanceMultiplier(currentTile);
    const mpRegen = Math.round(BASE_CHANNEL_MP * latticeMultiplier);

    const turnResult = buildTurnResult({
      entityId: PLAYER_ID,
      actionType: 'channel',
      origin: player.position,
      narrativeLog: `You anchor into the lattice and recover ${mpRegen} MP.`,
      commentary: 'Resonance is gathered rather than spent.',
      scoreSummary: {
        totalScore: null,
        school: player.school,
        rarity: null,
        speechAct: null,
        bridgeIntent: null,
        dominantArchetype: null,
        dominantTier: null,
        badges: ['CHANNEL', `${mpRegen} MP`],
      },
      signals: { resonance: Number((latticeMultiplier - 1).toFixed(3)), school: player.school },
    });

    handOffTurnToOpponent(turnResult, (entity) => {
      if (entity.id !== PLAYER_ID) return entity;
      return {
        ...entity,
        mp: clampBetween(entity.mp + mpRegen, 0, entity.maxMp),
        statusEffects: mergeStatusEffects(entity.statusEffects, {
          id: RESONANCE_CHARGE_ID,
          chainId: 'resonance_charge',
          label: 'Resonance Charge',
          disposition: 'BUFF',
          school: entity.school,
          tier: 1,
          turns: 1,
          turnsRemaining: 1,
          magnitude: Number((Math.max(0, latticeMultiplier - 0.25)).toFixed(3)),
        }),
      };
    });

    return turnResult;
  }, [battleState, handOffTurnToOpponent]);

  const waitTurn = useCallback(() => {
    if (!battleState || battleState.activeEntityId !== PLAYER_ID) return null;

    const player = battleState.entities.find((entity) => entity.id === PLAYER_ID);
    const turnResult = buildTurnResult({
      entityId: PLAYER_ID,
      actionType: 'wait',
      origin: player.position,
      narrativeLog: 'You hold your line and let the next exchange gather.',
      commentary: 'Temporal patience trades immediate action for field awareness.',
      scoreSummary: {
        totalScore: null,
        school: player.school,
        rarity: null,
        speechAct: null,
        bridgeIntent: null,
        dominantArchetype: null,
        dominantTier: null,
        badges: ['WAIT'],
      },
      signals: { resonance: 0, school: player.school },
    });

    handOffTurnToOpponent(turnResult, (entity) => entity);
    return turnResult;
  }, [battleState, handOffTurnToOpponent]);

  const submitScroll = useCallback(async (verse, weave, targetCell, affectedCells = []) => {
    if (!battleState || battleState.activeEntityId !== PLAYER_ID) return null;

    const player = battleState.entities.find((entity) => entity.id === PLAYER_ID);
    const opponent = battleState.entities.find((entity) => entity.id === OPPONENT_ID);
    if (!player || !opponent) return null;

    setIsResolving(true);

    try {
      const {
        scoreData,
        verseIR,
      } = await resolvePlayerCombatProfile({
        verse,
        weave,
        arenaSchool: battleState.metadata?.arenaSchool || player.school,
        opponentSchool: opponent.school,
        opponent,
        scoringEngine: scoringEngineRef.current,
        speakerProfile: player.voiceProfile,
      });

      const chargeMultiplier = 1 + getStatusMagnitude(player, 'resonance_charge');
      const superchargeMultiplier = player.supercharged ? 2 : 1;
      const cadencePenalty = getStatusMagnitude(player, 'cadence_fracture');
      const latticeCell = battleState.grid?.[player.position.y]?.[player.position.x];
      const latticeMultiplier = getTileResonanceMultiplier(latticeCell);
      const statusPenaltyMultiplier = Math.max(0.55, 1 - cadencePenalty);
      const castMultiplier = chargeMultiplier * latticeMultiplier * statusPenaltyMultiplier * superchargeMultiplier;
      const adjustedDamage = Math.max(1, Math.round((Number(scoreData.damage) || 0) * castMultiplier));
      const adjustedHealing = Math.max(0, Math.round((Number(scoreData.healing) || 0) * chargeMultiplier * superchargeMultiplier));

      // Instability fizzle: while unstable (from an incoherent leyline extraction),
      // an incoherent cast risks collapsing. Fail chance peaks at 15% and falls
      // toward 0 the more coherent the verse — a well-formed spell casts through.
      // The roll is seeded on the turn (not the phrase) so it can't be re-rolled by
      // tweaking a word; coherence is the only lever the scholar controls.
      const castCoherence = Number.isFinite(scoreData?.cohesionScore)
        ? clampBetween(scoreData.cohesionScore, 0, 1)
        : computeLinguisticCoherence(verse);
      const isUnstable = (player.unstableUntilTurn || 0) >= battleState.playerTurnIndex;
      const fizzleChance = isUnstable ? 0.15 * (1 - castCoherence) : 0;
      const fizzleRoll = createSeededRandom(
        stableHash(`${battleState.metadata?.battleSeed}:fizzle:${battleState.round}:${battleState.playerTurnIndex}`)
      )();
      const fizzled = fizzleChance > 0 && fizzleRoll < fizzleChance;

      const scoreSummary = buildPlayerCastSummary(scoreData, verseIR?.verseIRAmplifier);
      if (fizzled && scoreSummary && Array.isArray(scoreSummary.badges)) {
        scoreSummary.badges = ['FIZZLED', ...scoreSummary.badges];
      }
      const resolvedCells = uniqueCells(
        affectedCells.length > 0 ? affectedCells : [targetCell],
        battleState.gridWidth,
        battleState.gridHeight
      );
      const supportCast = Boolean(scoreData?.intent?.healing || adjustedHealing > 0 || scoreData?.intent?.buff);
      const healingMode = scoreData?.intent?.healingMode || 'NONE';
      const supportSelfTargeted = Boolean(
        supportCast
        && targetCell?.x === player.position.x
        && targetCell?.y === player.position.y
      );
      const damageMap = [];

      resolvedCells.forEach((cell) => {
        if (fizzled) return; // collapsed cast deals nothing
        if (supportCast && !supportSelfTargeted) return;
        const occupantId = battleState.grid?.[cell.y]?.[cell.x]?.occupantId;
        if (!occupantId) return;
        const target = battleState.entities.find((entity) => entity.id === occupantId);
        if (!target) return;

        const distance = Math.abs(cell.x - player.position.x) + Math.abs(cell.y - player.position.y);
        const spatialMultiplier = supportCast && occupantId === PLAYER_ID
          ? 1
          : Math.max(0.45, 1 - (distance * 0.12));

        if (supportCast && occupantId !== PLAYER_ID) {
          return;
        }

        if (supportCast && occupantId === PLAYER_ID && healingMode !== 'REGEN') {
          const restoredAmount = adjustedHealing > 0
            ? adjustedHealing
            : Math.max(20, Math.round(adjustedDamage * 0.35));
          damageMap.push({
            targetId: occupantId,
            targetName: target.name,
            amount: -restoredAmount,
            outcomeLabel: 'RESTORED',
          });
          return;
        }

        if (occupantId === PLAYER_ID) return;

        const amount = Math.max(1, Math.round(adjustedDamage * spatialMultiplier));
        damageMap.push({
          targetId: occupantId,
          targetName: target.name,
          amount,
          outcomeLabel: scoreData?.bridge?.collapsed
            ? 'DESTABILIZED'
            : amount >= adjustedDamage
              ? 'DIRECT HIT'
              : 'FALLOFF',
        });
      });

      const damageDealt = fizzled ? 0 : damageMap.reduce((sum, d) => d.amount > 0 ? sum + d.amount : sum, 0);
      const healingDone = fizzled ? 0 : damageMap.reduce((sum, d) => d.amount < 0 ? sum + Math.abs(d.amount) : sum, 0);
      const rhymeQuality = scoreData?.rhymeQuality ?? 0;
      const verseIRMultiplier = scoreData?.verseIRMultiplier ?? 1;
      const verbalFormMultiplier = scoreData?.verbalFormMultiplier ?? 1;
      const affinity = scoreData?.school || player.school;

      const turnResult = buildTurnResult({
        entityId: PLAYER_ID,
        type: 'PLAYER_CAST',
        actionType: 'cast',
        phrase: verse,
        round: battleState.round,
        turnIndex: battleState.playerTurnIndex,
        damageDealt,
        healingDone,
        playerHpAtCast: player.hp,
        playerMaxHpAtCast: player.maxHp,
        mpCost: CAST_MP_COST,
        wasSupercharged: player.supercharged,
        profile: {
          rhymeQuality,
          verseIRMultiplier,
          verbalFormMultiplier,
          affinity,
          syntacticalChess: scoreData?.syntacticalChess || null,
        },
        origin: player.position,
        targetCell,
        affectedCells: resolvedCells,
        damageMap,
        spellText: verse,
        weaveText: weave,
        text: verse,
        lines: splitCombatLines(verse),
        narrativeLog: fizzled
          ? `[INSTABILITY] The unstable lattice rejects your verse — the incantation collapses before it lands. Coherent phrasing would have held it together.`
          : buildPlayerNarrative({
          scoreData,
          damageMap,
          latticePrefix: latticeCell?.fieldEffect?.type === 'RESONANCE_BUFF'
            ? '[LATTICE RESONANCE] The field brightens around your verse.'
            : latticeCell?.fieldEffect?.type === 'POISON_SNARE'
              ? '[ENTROPIC DECAY] The snare hollows your opening pressure.'
              : '',
          chargeMultiplier,
        }),
        commentary: scoreData.commentary,
        traces: scoreData.traces || [],
        explainTrace: scoreData.explainTrace || scoreData.traces || [],
        bridge: scoreData.bridge || null,
        speaking: scoreData.speaking || null,
        scoreData,
        scoreSummary,
        dominantArchetype: scoreData?.verseIRAmplifier?.dominantArchetype || null,
        statusEffect: scoreData.statusEffect || null,
        telegraph: null,
        signals: {
          resonance: Number((castMultiplier - 1).toFixed(3)),
          school: scoreData.school,
          collapsed: Boolean(scoreData?.bridge?.collapsed),
          fizzled,
          syntacticalChess: scoreData?.syntacticalChess || null,
        },
      });

      handOffTurnToOpponent(turnResult, (entity) => {
        const damageEntry = damageMap.find((entry) => entry.targetId === entity.id);
        let updated = applyDamageEntry(entity, damageEntry);

        if (entity.id === PLAYER_ID) {
          // Record word use for player progression
          if (Array.isArray(turnResult.tokens)) {
            turnResult.tokens.forEach(token => {
              if (token && typeof token === 'string') {
                recordWordUse(token, scoreSummary);
              }
            });
          }

          updated = {
            ...updated,
            mp: clampBetween(updated.mp - CAST_MP_COST, 0, updated.maxMp),
            voiceProfile: scoreData.nextVoiceProfile || updated.voiceProfile || null,
            lastScoreSummary: scoreSummary,
            lastScoreData: scoreData,
            supercharged: false,
            // Instability is NOT consumed by casting — it decays on its own turn-index
            // expiry (unstableUntilTurn), so every cast in the window carries risk.
            statusEffects: (updated.statusEffects || [])
              .filter((effect) => effect?.id !== RESONANCE_CHARGE_ID)
              .filter((effect) => effect?.chainId !== 'omen_mark'),
          };

          if (supportSelfTargeted && scoreData.statusEffect?.disposition === 'BUFF') {
            updated.statusEffects = mergeStatusEffects(updated.statusEffects, scoreData.statusEffect);
          }

          return updated;
        }

        if (entity.id === OPPONENT_ID) {
          updated = {
            ...updated,
            lastScoreSummary: damageEntry ? scoreSummary : entity.lastScoreSummary,
          };
          if (!supportCast && scoreData.statusEffect?.disposition === 'DEBUFF' && damageEntry) {
            updated.statusEffects = mergeStatusEffects(updated.statusEffects, scoreData.statusEffect);
          }
          return updated;
        }

        return updated;
      });

      return turnResult;
    } finally {
      setIsResolving(false);
    }
  }, [battleState, handOffTurnToOpponent, recordWordUse]);

  const submitExtraction = useCallback(async (phrase, targetTile) => {
    if (!battleState || battleState.activeEntityId !== PLAYER_ID || isResolving) return null;

    const player = battleState.entities.find((entity) => entity.id === PLAYER_ID);
    if (!player) return null;

    if (player.position.x !== targetTile.x || player.position.y !== targetTile.y) {
      console.warn('[useBattleSession] Extraction coordinates mismatch player position.');
      return null;
    }

    const activeLeyline = battleState.leylines.find(
      ley => ley.coord.x === targetTile.x && ley.coord.y === targetTile.y
    );

    if (!activeLeyline) {
      console.warn('[useBattleSession] No leyline found on occupied tile.');
      return null;
    }

    const currentPhase = getLeylinePhase(activeLeyline, battleState.playerTurnIndex, battleState.spentLeylineIds);
    if (currentPhase !== 'glowing') {
      console.warn('[useBattleSession] Leyline is not active.');
      return null;
    }

    setIsResolving(true);

    try {
      const scoringResult = scoreExtraction(phrase, activeLeyline, player);
      const { ok, extractionScore, result, manaExtracted, instability, diagnostics } = scoringResult;

      const isSupercharged = result === 'SUPERCHARGED';
      const narrativeLog = `[LEYLINE EXTRACTION] You harvest the ${activeLeyline.affinity} Leyline (★${activeLeyline.stars}) by phrasing: "${phrase}". ${
        ok ? `Mana gathered: +${manaExtracted} MP. ${isSupercharged ? '(SUPERCHARGED!)' : ''}` : 'The extraction attempt collapsed.'
      } ${instability ? 'An entropic backlash destabilizes the local grid.' : ''}`;

      const turnResult = buildTurnResult({
        entityId: PLAYER_ID,
        actionType: 'extract',
        origin: player.position,
        targetCell: targetTile,
        spellText: phrase,
        text: phrase,
        narrativeLog,
        commentary: diagnostics.join(' · '),
        scoreSummary: {
          totalScore: extractionScore,
          school: activeLeyline.affinity,
          badges: [
            'EXTRACTION',
            ok ? `+${manaExtracted} MP` : 'FAILED',
            isSupercharged ? 'SUPERCHARGED' : null
          ].filter(Boolean)
        },
        signals: {
          extractionScore,
          ok,
          manaExtracted,
          supercharged: isSupercharged,
          instability
        }
      });

      handOffTurnToOpponent(turnResult, (entity) => {
        if (entity.id !== PLAYER_ID) return entity;
        return {
          ...entity,
          mp: clampBetween(entity.mp + manaExtracted, 0, entity.maxMp),
          supercharged: isSupercharged ? true : (entity.supercharged || false),
          // Incoherent extraction leaves the scholar UNSTABLE for 2 turns: any cast in
          // that window risks fizzling. Tracked as an expiry turn-index so it decays
          // deterministically rather than being consumed by a single cast (see submitScroll).
          unstableUntilTurn: instability
            ? battleState.playerTurnIndex + 2
            : (entity.unstableUntilTurn || 0)
        };
      });

      setBattleState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          spentLeylineIds: prev.spentLeylineIds.includes(activeLeyline.id)
            ? prev.spentLeylineIds
            : [...prev.spentLeylineIds, activeLeyline.id]
        };
      });

      return turnResult;
    } finally {
      setIsResolving(false);
    }
  }, [battleState, isResolving, handOffTurnToOpponent]);

  const resolveOpponentTurn = useCallback(async () => {
    if (!battleState || battleState.activeEntityId !== OPPONENT_ID || isResolving) return;

    setIsResolving(true);
    await new Promise((resolve) => setTimeout(resolve, 900));

    setBattleState((prev) => {
      if (!prev || prev.activeEntityId !== OPPONENT_ID) return prev;

      const opponent = prev.entities.find((entity) => entity.id === OPPONENT_ID);
      const player = prev.entities.find((entity) => entity.id === PLAYER_ID);
      if (!opponent || !player) return prev;

      const playerHistory = prev.history.filter((turn) => turn.entityId === PLAYER_ID);
      const playerContext = [...playerHistory].reverse().find((turn) => turn.actionType === 'cast') || null;
      const opponentSpell = generateOpponentSpell({
        opponent,
        playerHistory,
        playerContext,
        turnNumber: prev.round,
        arenaSchool: prev.metadata?.arenaSchool || opponent.school,
      });

      const nextPosition = chooseOpponentMove({
        battleState: prev,
        opponent,
        player,
        opponentSpell,
      });
      const destinationCell = prev.grid?.[nextPosition.y]?.[nextPosition.x];
      const stanceMultiplier = getTileResonanceMultiplier(destinationCell);
      const omenExposure = 1 + getStatusMagnitude(player, 'omen_mark');
      const cadenceExposure = 1 + (getStatusMagnitude(player, 'cadence_fracture') * 0.5);
      const damage = Math.max(
        12,
        Math.round((Number(opponentSpell.damage) || 0) * stanceMultiplier * omenExposure * cadenceExposure)
      );
      const mpDrain = opponentSpell?.signatureMove?.type === 'TOKEN_THEFT'
        ? Math.round(player.maxMp * Math.max(0.08, Number(opponentSpell?.statusEffect?.magnitude) || 0.1))
        : 0;
      const damageMap = [{
        targetId: PLAYER_ID,
        targetName: player.name,
        amount: damage,
        outcomeLabel: opponentSpell?.signatureMove?.name
          ? String(opponentSpell.signatureMove.name).toUpperCase()
          : 'COUNTER',
      }];

      const turnResult = buildTurnResult({
        entityId: OPPONENT_ID,
        actionType: 'cast',
        origin: nextPosition,
        previousPosition: { ...opponent.position },
        destination: nextPosition,
        targetCell: { ...player.position },
        affectedCells: [{ ...player.position }],
        motion: {
          origin: { ...opponent.position },
          destination: nextPosition,
          target: { ...player.position },
        },
        damageMap,
        spellText: opponentSpell.spell,
        text: opponentSpell.spell,
        lines: splitCombatLines(opponentSpell.spell),
        narrativeLog: `${opponent.name} answers with ${opponentSpell.telegraph?.label || 'a counter-verse'}. ${opponentSpell.commentary} ${player.name} suffers ${damage} damage.${mpDrain > 0 ? ` ${mpDrain} MP is stripped away.` : ''}`,
        commentary: opponentSpell.commentary,
        traces: opponentSpell.traces || [],
        explainTrace: opponentSpell.explainTrace || opponentSpell.traces || [],
        bridge: null,
        speaking: opponentSpell.speaking || null,
        scoreSummary: buildOpponentSummary(opponentSpell),
        dominantArchetype: opponentSpell.signatureMove
          ? { label: opponentSpell.signatureMove.name }
          : null,
        statusEffect: opponentSpell.statusEffect || null,
        telegraph: opponentSpell.telegraph || null,
        counterTokens: opponentSpell.counterTokens || [],
        signatureMove: opponentSpell.signatureMove || null,
        signals: {
          resonance: Number((stanceMultiplier - 1).toFixed(3)),
          school: opponentSpell.school,
        },
      });

      const nextEntities = prev.entities.map((entity) => {
        if (entity.id === PLAYER_ID) {
          let updated = applyPlayerTurnStartRecovery(entity, { mpDrain, damage });

          if (opponentSpell.statusEffect?.disposition === 'DEBUFF') {
            updated.statusEffects = mergeStatusEffects(updated.statusEffects, opponentSpell.statusEffect);
          }

          return {
            ...updated,
            movesRemaining: updated.maxMovesPerTurn,
          };
        }

        if (entity.id === OPPONENT_ID) {
          return {
            ...entity,
            position: nextPosition,
            voiceProfile: opponentSpell.nextVoiceProfile || entity.voiceProfile || null,
            telegraph: opponentSpell.telegraph || null,
            signatureMove: opponentSpell.signatureMove || null,
            counterTokens: opponentSpell.counterTokens || [],
            lastScoreSummary: buildOpponentSummary(opponentSpell),
            statusEffects: tickStatusEffects(entity.statusEffects),
            movesRemaining: entity.maxMovesPerTurn,
          };
        }

        return entity;
      });

      const nextPlayer = nextEntities.find(e => e.id === PLAYER_ID);
      const nextOpponent = nextEntities.find(e => e.id === OPPONENT_ID);
      let phase = 'player_writing';
      if (nextOpponent && nextOpponent.hp <= 0) {
        phase = 'victory';
      } else if (nextPlayer && nextPlayer.hp <= 0) {
        phase = 'defeat';
      }

      const nextGrid = prev.grid.map((row) => row.map((cell) => ({
        ...cell,
        occupantId: null,
      })));
      nextEntities.forEach((entity) => {
        nextGrid[entity.position.y][entity.position.x].occupantId = entity.id;
      });

      return {
        ...prev,
        entities: nextEntities,
        grid: nextGrid,
        phase,
        history: [...prev.history, turnResult],
        activeEntityId: PLAYER_ID,
        round: phase === 'player_writing' ? prev.round + 1 : prev.round,
        playerTurnIndex: phase === 'player_writing' ? (prev.playerTurnIndex || 1) + 1 : (prev.playerTurnIndex || 1)
      };
    });

    setIsResolving(false);
    setTurnTimeRemaining(TURN_TIME_SECONDS);
  }, [battleState, isResolving]);

  const fleeBattle = useCallback(() => {
    setBattleState((prev) => (prev ? { ...prev, phase: 'defeat' } : prev));
  }, []);

  useEffect(() => {
    if (battleState?.activeEntityId === OPPONENT_ID && !isResolving) {
      resolveOpponentTurn();
    }
  }, [battleState?.activeEntityId, isResolving, resolveOpponentTurn]);

  useEffect(() => {
    if (battleState?.phase === 'player_writing' && turnTimeRemaining > 0) {
      timerRef.current = setInterval(() => {
        setTurnTimeRemaining((current) => {
          if (current <= 1) {
            clearInterval(timerRef.current);
            return 0;
          }
          return current - 1;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }

    return () => clearInterval(timerRef.current);
  }, [battleState?.phase, turnTimeRemaining]);

  useEffect(() => {
    if (battleState?.activeEntityId === PLAYER_ID && battleState?.phase === 'player_writing' && turnTimeRemaining === 0 && !isResolving) {
      waitTurn();
    }
  }, [battleState?.activeEntityId, battleState?.phase, turnTimeRemaining, isResolving, waitTurn]);

  return {
    battleState,
    startBattle,
    submitScroll,
    submitExtraction,
    channelEnergy,
    waitTurn,
    moveEntity,
    fleeBattle,
    isResolving,
    turnTimeRemaining,
    isPlayerTurn: battleState?.activeEntityId === PLAYER_ID,
  };
}
