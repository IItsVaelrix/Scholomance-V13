import { createEmptyGrid, INITIAL_GRID_SIZE } from '../../../codex/core/battle.schemas.js';
import { createCombatOpponent } from '../../../codex/core/opponent.engine.js';
import {
  OPPONENT_MAX_HP,
  PLAYER_MAX_HP,
  tickStatusEffects,
  getStatusMagnitude,
} from '../../../codex/core/combat.session.js';

const PLAYER_ID = 'player';
const OPPONENT_ID = 'opponent';

export function stableHash(value) {
  const text = String(value || '');
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash) + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function createSeededRandom(seed) {
  let state = (Math.abs(Number(seed) || 1) % 2147483646) + 1;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function clampBetween(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

export function createInitialCombatState({ seed = 'TEST_SEED_1', archetypeId = 'test_archetype' } = {}) {
  const opponentData = createCombatOpponent({
    id: archetypeId,
    random: createSeededRandom(stableHash(seed)),
  });
  const arenaSchool = opponentData.school || 'SONIC';
  const battleSeed = stableHash(`${seed}:${opponentData.name}:${opponentData.school}`);

  const player = {
    id: PLAYER_ID,
    name: 'Scholar',
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
      SYNT: 10, META: 10, MYTH: 10, VIS: 10, PSYC: 10, CODEX: 10, INT: 10,
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
    int: opponentData.int || 12,
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
    new Set([`${player.position.x},${player.position.y}`, `${opponent.position.x},${opponent.position.y}`])
  );

  return {
    id: `battle_${battleSeed}`,
    seed,
    rngState: String(battleSeed), // stable hash serialization
    phase: 'player_writing',
    activeTurnSide: 'player',
    turnCount: 1,
    arenaSchool,
    gridWidth: INITIAL_GRID_SIZE,
    gridHeight: INITIAL_GRID_SIZE,
    grid,
    entities: [player, opponent],
    turnLog: [],
  };
}

export function applyCombatCommand(state, entry) {
  // Pure function representing Godot engine boundary.
  // entry: { actorId: 'player', command: 'MOVE 1 0' } or { actorId: 'player', command: 'CAST MEND self', resolvedSpell: ... }
  let nextState = JSON.parse(JSON.stringify(state)); // Deep copy

  const parts = entry.command.split(' ');
  const action = parts[0];

  if (action === 'MOVE') {
    const dx = parseInt(parts[1], 10);
    const dy = parseInt(parts[2], 10);
    const actorIndex = nextState.entities.findIndex(e => e.id === entry.actorId);
    if (actorIndex > -1) {
      const actor = nextState.entities[actorIndex];
      const nextX = actor.position.x + dx;
      const nextY = actor.position.y + dy;

      if (nextX >= 0 && nextX < nextState.gridWidth && nextY >= 0 && nextY < nextState.gridHeight) {
        // Clear old cell
        nextState.grid[actor.position.y][actor.position.x].occupantId = null;
        // Set new cell
        actor.position.x = nextX;
        actor.position.y = nextY;
        nextState.grid[actor.position.y][actor.position.x].occupantId = actor.id;
        actor.movesRemaining -= 1;
      }
    }
  } else if (action === 'CHANNEL') {
    // Basic MP channel logic stub
    const actorIndex = nextState.entities.findIndex(e => e.id === entry.actorId);
    if (actorIndex > -1) {
      const actor = nextState.entities[actorIndex];
      actor.mp = Math.min(actor.maxMp, actor.mp + 20); // Base channel
      // Should apply resonance status, simplified here
      nextState.turnCount += 1;
      nextState.activeTurnSide = (nextState.activeTurnSide === 'player') ? 'opponent' : 'player';
    }
  } else if (action === 'CAST' || action === 'COUNTER') {
    if (entry.resolvedSpell) {
      // Godot-style packet resolution
      entry.resolvedSpell.effects.forEach(eff => {
        if (eff.kind === 'HEAL') {
          const targetIndex = nextState.entities.findIndex(e => e.id === entry.actorId); // Self heal
          if (targetIndex > -1) {
            nextState.entities[targetIndex].hp = Math.min(nextState.entities[targetIndex].maxHp, nextState.entities[targetIndex].hp + eff.amount);
          }
        } else if (eff.kind === 'DAMAGE') {
          const targetIndex = nextState.entities.findIndex(e => e.id !== entry.actorId); // Enemy damage
          if (targetIndex > -1) {
            nextState.entities[targetIndex].hp = Math.max(0, nextState.entities[targetIndex].hp - eff.amount);
          }
        } else if (eff.kind === 'STATUS') {
          const targetIndex = nextState.entities.findIndex(e => e.id !== entry.actorId); // Enemy status
          if (targetIndex > -1) {
            nextState.entities[targetIndex].statusEffects.push({
              id: eff.type,
              type: eff.type,
              magnitude: eff.magnitude,
              turnsRemaining: eff.duration
            });
          }
        }
      });
      // Deduct cost
      if (entry.resolvedSpell.cost?.mp) {
        const actorIndex = nextState.entities.findIndex(e => e.id === entry.actorId);
        if (actorIndex > -1) {
          nextState.entities[actorIndex].mp = Math.max(0, nextState.entities[actorIndex].mp - entry.resolvedSpell.cost.mp);
        }
      }
    }

    // Turn swap
    nextState.turnCount += 1;
    nextState.activeTurnSide = (nextState.activeTurnSide === 'player') ? 'opponent' : 'player';
  } else if (action === 'END_TURN') {
    // Turn swap
    nextState.turnCount += 1;
    nextState.activeTurnSide = (nextState.activeTurnSide === 'player') ? 'opponent' : 'player';
  }

  // Restore moves on turn swap
  // We check if it was a turn swapping action (CAST, COUNTER, CHANNEL, END_TURN)
  // Actually, wait, let's just restore if we just swapped turns.
  // It's cleaner to restore for the activeTurnSide IF it's a new turn.
  if (['CHANNEL', 'CAST', 'COUNTER', 'END_TURN'].includes(action)) {
    nextState.entities.forEach(e => {
      if (e.id === nextState.activeTurnSide) {
        e.movesRemaining = e.maxMovesPerTurn;
        e.statusEffects = tickStatusEffects(e.statusEffects);
      }
    });
  }

  return nextState;
}

export function canonicalizeCombatState(state, { step }) {
  const snapshot = {
    step,
    round: state.turnCount,
    turn: state.activeTurnSide,
    rngState: String(state.rngState),
    units: state.entities.map(e => ({
      id: e.id,
      hp: Math.floor(e.hp),
      mp: Math.floor(e.mp),
      ap: e.movesRemaining, // Treating movesRemaining as AP
      col: e.position.x,
      row: e.position.y,
      statuses: [...(e.statusEffects || [])].sort((a, b) => a.id.localeCompare(b.id)),
    })).sort((a, b) => a.id.localeCompare(b.id)),
    grid: {
      cols: state.gridWidth,
      rows: state.gridHeight,
      blocked: [],
    },
  };

  // Build grid blocked data
  for (let r = 0; r < state.gridHeight; r++) {
    for (let c = 0; c < state.gridWidth; c++) {
      if (state.grid[r][c]?.blocked) {
        snapshot.grid.blocked.push({ row: r, col: c });
      }
    }
  }

  return snapshot;
}
