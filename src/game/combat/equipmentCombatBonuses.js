/**
 * Aggregates combat bonuses from equipped inventory items.
 */

export function aggregateEquipmentBonuses(equipment = {}) {
  const scholomance = {};
  const grantedAbilities = [];
  let movementPoints = 0;
  let attackPoints = 0;
  let attackRange = 0;

  for (const item of Object.values(equipment)) {
    if (!item || typeof item !== 'object') continue;

    if (Array.isArray(item.grantedAbilities)) {
      grantedAbilities.push(...item.grantedAbilities);
    }

    const modifiers = item.combatModifiers;
    if (!modifiers) continue;

    movementPoints += Number(modifiers.movementPoints) || 0;
    attackPoints += Number(modifiers.attackPoints) || 0;
    attackRange += Number(modifiers.attackRange) || 0;

    if (modifiers.scholomance && typeof modifiers.scholomance === 'object') {
      for (const [key, value] of Object.entries(modifiers.scholomance)) {
        const statKey = String(key).toUpperCase();
        scholomance[statKey] = (scholomance[statKey] || 0) + (Number(value) || 0);
      }
    }
  }

  return {
    movementPoints,
    attackPoints,
    attackRange,
    scholomance,
    grantedAbilities: [...new Set(grantedAbilities)],
  };
}