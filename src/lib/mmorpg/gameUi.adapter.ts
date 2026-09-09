import { getInventorySnapshot, setInventorySnapshot } from '../../game/inventory/inventoryService.js';
import { inventorySlotOf } from '../../data/itemDatabase.js';
import { getScholomanceXpSnapshot } from '../../game/character/scholomanceXpService.js';
import { buildCharacterCompendiumSnapshot } from '../../game/character/characterCompendium.js';
import { WORLD_MAPS } from '../../game/world/worldMapRegistry.js';
import { getCombatGame } from '../../game/combat/combatGameBridge.js';
import type { Item, Receipt } from './contracts';
import type { ChannelStore } from './state';
export interface InventorySnapshot { slots: (Item | null)[]; equipped: Record<string, Item | null>; revision: number }
export interface CombatSnapshot { hp?: number; maxHp?: number; manaPointsRemaining?: number; manaPoints?: number; movementPointsRemaining?: number; movementPoints?: number; attackPointsRemaining?: number; attackPoints?: number; attackRange?: number; attackUsed?: boolean; spellweaveUsed?: boolean; battleEngaged?: boolean; icicleSlamCooldown?: number; grantedAbilities?: string[] }
export interface SceneSnapshot { sceneId?: string; casterId?: string; selectedCombatTargetId?: string; targets?: { id: string; label: string; kind: string; tx?: number; ty?: number; inRange?: boolean; reachable?: boolean; metadata?: { school?: string; boss?: string } }[] }
export const readInventory = (): InventorySnapshot => ({ ...getInventorySnapshot(), revision: 0 } as InventorySnapshot);
export const readCharacter = (combatStats?: CombatSnapshot) => buildCharacterCompendiumSnapshot({ combatStats: combatStats || null });
export const readXp = () => getScholomanceXpSnapshot();
export const readRegions = () => Object.values(WORLD_MAPS).map(region => ({ id: region.id, name: region.label, width: region.gridSize, height: region.gridSize, markers: [] }));
export function connectGameUi(store: ChannelStore) {
  let revision = 0;
  const bindings: [string, EventListener][] = [];
  const listen = (name: string, fn: (detail: never) => void) => {
    const handler: EventListener = event => fn((event as CustomEvent).detail);
    window.addEventListener(name, handler); bindings.push([name, handler]);
  };
  const equipment = () => window.dispatchEvent(new CustomEvent('equipment-changed', { detail: getInventorySnapshot().equipped }));
  listen('inventory-changed', detail => { revision += 1; store.publish('inventory', { ...(detail as InventorySnapshot), revision }); equipment(); });
  listen('request-equipment-state', equipment);
  listen('combat-stats-changed', detail => store.publish('combat', detail));
  listen('scene-context-state', detail => store.publish('scene', detail));
  listen('combat-target-selected', detail => store.publish('target', detail));
  listen('scholomance-xp-changed', detail => store.publish('xp', detail));
  listen('inventory-item-granted', detail => store.publish('lootNotice', detail));
  equipment(); window.dispatchEvent(new CustomEvent('request-scene-context'));
  return () => bindings.forEach(([name, handler]) => window.removeEventListener(name, handler));
}
/** Re-read before committing. Drag revision is checked by the caller against its channel. */
export function inventoryCommand(command: string, args: { index?: number; targetIndex?: number; slot?: string; expectedId?: string }): Receipt {
  const state = getInventorySnapshot() as unknown as InventorySnapshot;
  const slots = [...state.slots]; const equipped = { ...state.equipped };
  if (command === 'equip') {
    const index = args.index;
    if (!Number.isInteger(index) || index === undefined || index < 0 || index >= slots.length) return { ok: false, message: 'Invalid inventory slot' };
    const item = slots[index];
    if (!item || item.id !== args.expectedId) return { ok: false, message: 'Item changed. Select it again.' };
    const target = inventorySlotOf(item, equipped);
    if (!target || !(target in equipped) || (args.slot && args.slot !== target)) return { ok: false, message: 'This item does not fit that slot.' };
    slots[index] = equipped[target]; equipped[target] = item;
  } else if (command === 'unequip') {
    const slot = args.slot;
    if (!slot || !(slot in equipped) || !equipped[slot] || equipped[slot]?.id !== args.expectedId) return { ok: false, message: 'Equipment changed. Select it again.' };
    const index = slots.findIndex(item => item === null);
    if (index < 0) return { ok: false, message: 'Your inventory is full.' };
    slots[index] = equipped[slot]; equipped[slot] = null;
  } else if (command === 'move') {
    const from = args.index; const to = args.targetIndex;
    if (from === undefined || to === undefined || !Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= slots.length || to >= slots.length || slots[from]?.id !== args.expectedId) return { ok: false, message: 'Inventory changed. Pick up the item again.' };
    [slots[from], slots[to]] = [slots[to], slots[from]];
  } else return { ok: false, message: 'This action is not available.' };
  setInventorySnapshot({ slots, equipped }); return { ok: true };
}
const COMBAT_COMMANDS: Record<string, string> = { attack: 'combat-attack', endTurn: 'combat-endturn', icicle: 'combat-icicle-slam' };
export function combatCommand(id: string) {
  const event = COMBAT_COMMANDS[id];
  if (event) window.dispatchEvent(new CustomEvent(event));
}
/** Save/restore only our own keyboard suspension. Never enable a scene-owned lock. */
export function suspendGameKeyboard() {
  const keyboard = getCombatGame()?.input?.keyboard;
  if (!keyboard || !keyboard.enabled) return () => {};
  keyboard.enabled = false;
  return () => { keyboard.enabled = true; };
}
