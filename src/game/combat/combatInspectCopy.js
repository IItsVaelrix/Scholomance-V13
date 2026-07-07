import { getIntelligenceTier } from './combatIntelligence.js';

/**
 * Flavor copy for combat right-click inspection.
 * Returns presentation fields consumed by CombatPage tooltip + terminal dialogue.
 */
export function buildInspectPresentation(action = {}) {
  if (action.isStormheartOrb) {
    return {
      title: 'Stormheart Orb',
      details: [
        'A storm-core orbiting the sunken obelisk crown.',
        'It thrums with unread SONIC discharge.',
      ],
      characterLine: 'The orb is warm. The tower left its heart behind.',
    };
  }

  if (action.isIsland) {
    if (action.gatherable) {
      return {
        title: 'Void Ore Spire',
        details: [
          `Elevation: ${action.height}`,
          `Coordinate: (${action.tx}, ${action.ty})`,
          'Gatherable with a pickaxe.',
        ],
        characterLine: 'Crystallized void-ore veins the spire. A pickaxe could pry this loose.',
      };
    }
    return {
      title: 'Void Terrain',
      details: [
        `Elevation: ${action.height}`,
        `Coordinate: (${action.tx}, ${action.ty})`,
      ],
      characterLine: 'The voidstone shifts underfoot, still settling from the carve.',
    };
  }

  if (action.isGrid && action.isObelisk) {
    const details = [`State: ${action.obeliskState || 'active'}`];
    let characterLine = action.obeliskClue
      || "Maybe it's possible to do something about this electricity...";

    if (action.hasStormheartOrb) {
      details.push('Stormheart Orb: resting on the sealed center tile.');
      characterLine = 'The compartment is flush with the grid. Only the orb remains.';
    } else if (action.obeliskState === 'looted') {
      details.push('Center tile: sealed. Compartment empty.');
      characterLine = 'The hatch is closed. Whatever the tower held is gone.';
    } else if (action.obeliskState === 'lowered') {
      details.push('The obelisk sank into a hidden compartment beneath the center tile.');
      characterLine = 'The tower is gone. Something gleams on the bare tile.';
    }

    return {
      title: action.obeliskState === 'active' ? 'Central Obelisk' : 'Center Tile',
      details,
      characterLine,
    };
  }

  if (action.isSentinel) {
    const hpLine = Number.isFinite(action.hp) ? `Integrity: ${action.hp}` : 'Integrity: unknown';
    const stanceLine = action.sentinelAggroed ? 'Status: aggro — tower perimeter breached' : 'Status: dormant';
    const intValue = Number.isFinite(action.sentinelIntelligence) ? action.sentinelIntelligence : null;
    const intLine = intValue != null
      ? `INT: ${intValue} (${getIntelligenceTier(intValue)})`
      : null;
    return {
      title: action.sentinelLabel || 'Brazier Sentinel',
      details: [
        'Armillary containment robot bound to the obelisk flank.',
        stanceLine,
        hpLine,
        ...(intLine ? [intLine] : []),
        `Coordinate: (${action.tx}, ${action.ty})`,
      ],
      characterLine: action.sentinelLine
        || (action.sentinelAggroed
          ? 'The matrix tracks you — it defends the tower.'
          : 'The matrix hums with SONIC charge — dormant until the obelisk is threatened.'),
    };
  }

  if (action.isPortal) {
    if (action.portalPhase === 'cleared') {
      return {
        title: 'Polaris Gate',
        details: [
          `Coordinate: (${action.tx}, ${action.ty})`,
          'The warden is gone — the aperture hums with sonic thaumaturgy.',
          'Stand on an adjacent tile, then click the gate to enter Polaris.',
        ],
        characterLine: 'The seal is broken. Polaris waits on the other side.',
      };
    }
    return {
      title: 'Dimensional Portal',
      details: [
        `Coordinate: (${action.tx}, ${action.ty})`,
        action.portalPhase === 'beckoning'
          ? 'The ward is unsealed — the seal flickers cyan over ice.'
          : 'A dimensional aperture bound to the northeast lattice.',
        ...(action.portalPhase === 'beckoning'
          ? ['Stand on an adjacent tile, then click the portal to challenge the warden.']
          : []),
      ],
      characterLine: action.portalPhase === 'beckoning'
        ? 'The Portal beckons... if you dare.'
        : 'Cold light churns behind the frame, but the seal still holds.',
    };
  }

  if (action.isGrid && action.leyline) {
    return {
      title: 'Leyline Node',
      details: [
        `Affinity: ${action.leyline.affinity}`,
        `Node ID: ${action.leyline.id}`,
      ],
      characterLine: `The fissure sings ${action.leyline.affinity}—a vein of battleground resonance.`,
    };
  }

  if (action.isGrid) {
    const battleTile = action.battleTile;
    const premiumTerrains = new Set(['rune', 'anchor', 'null']);
    const details = [`Coordinate: (${action.tx}, ${action.ty})`];
    let characterLine = 'An empty lattice square. Good footing for the next step.';

    if (battleTile?.modifier?.label) {
      details.push(`${battleTile.modifier.label}: ${battleTile.modifier.description || ''}`);
      characterLine = `The lattice declares itself — ${battleTile.modifier.label}.`;
    } else if (battleTile?.terrain && battleTile.terrain !== 'normal') {
      details.push(`Terrain: ${battleTile.terrain.replace(/_/g, ' ')}`);
    }

    if (battleTile && premiumTerrains.has(battleTile.terrain)) {
      const hintSeen = typeof localStorage !== 'undefined'
        && localStorage.getItem('tactical-premium-hint-seen');
      if (!hintSeen) {
        details.push('Premium tiles score your spells. Standing on them before you cast can change the outcome.');
        try {
          localStorage.setItem('tactical-premium-hint-seen', '1');
        } catch {
          // ignore storage failures
        }
      }
    }

    return {
      title: battleTile?.modifier?.label || 'Combat Tile',
      details,
      characterLine,
    };
  }

  return {
    title: 'Battlefield',
    details: [`Coordinate: (${action.tx}, ${action.ty})`],
    characterLine: 'I study the ground, but nothing declares itself.',
  };
}