import battleTileDefinitions from '../../data/combat/battleTileDefinitions.json';

const TILE_TYPES = battleTileDefinitions?.tileTypes || {};

export function getBattleTileDefinition(terrain) {
  if (!terrain) return null;
  return TILE_TYPES[terrain] || null;
}

export function formatModifierLines(modifier) {
  if (!modifier) return [];

  if (modifier.description) {
    return [modifier.description];
  }

  const lines = [];
  if (modifier.label) {
    lines.push(modifier.label);
  }

  if (typeof modifier.value === 'number' && modifier.kind !== 'spell_roll_bonus') {
    const pct = Math.abs(modifier.value) <= 1
      ? Math.round(modifier.value * 100)
      : Math.round(modifier.value);
    if (pct !== 0) {
      const sign = modifier.value >= 0 ? '+' : '-';
      lines.push(`${sign}${Math.abs(pct)}% spell modifier`);
    }
  }

  if (modifier.spellDieBonus) {
    lines.push(`+${modifier.spellDieBonus} spell die`);
  }

  if (typeof modifier.bridgeStabilityBonus === 'number') {
    const bridgePct = Math.abs(modifier.bridgeStabilityBonus) <= 1
      ? Math.round(modifier.bridgeStabilityBonus * 100)
      : Math.round(modifier.bridgeStabilityBonus);
    lines.push(`+${bridgePct}% bridge stability`);
  }

  if (modifier.rangeBonus) {
    lines.push(`+${modifier.rangeBonus} range`);
  }

  return lines.length ? lines : [];
}

export function formatSpellBonusLine(modifier) {
  if (!modifier || modifier.description) return null;
  const lines = formatModifierLines(modifier).filter((line) => line !== modifier.label);
  return lines.length ? lines.join(', ') : null;
}