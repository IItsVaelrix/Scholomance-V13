/** SCHOL-GAME-UI-v1: presentation projections; commands stay with game authority. */
export type LoadState = 'unavailable' | 'loading' | 'ready' | 'error';
export type ControlState = 'idle' | 'selected' | 'disabled' | 'cooldown' | 'warning' | 'error' | 'success';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'artifact';
export interface Stat { id?: string; label: string; value: string | number; delta?: number; description?: string }
export interface SocketModel { id: string; category: string; label: string; compatible?: string[]; modifier?: string; links?: string[] }
export interface Item {
  id: string; name: string; type: string; rarity?: string; icon?: string; sprite?: string;
  description?: string; itemLevel?: number; count?: number; slot?: string; school?: string;
  stats?: Stat[]; modifiers?: string[]; enchantments?: string[]; sockets?: SocketModel[];
  ampRelationships?: string[]; shaderRelationships?: string[]; traits?: string[];
  requirements?: string[]; sellValue?: string; flavor?: string; lore?: string;
  source?: string; binding?: string; locked?: boolean; favorite?: boolean; junk?: boolean;
}
export interface Ability {
  id: string; name: string; category: string; description?: string; icon?: string;
  unlocked: boolean; passive?: boolean; rank?: number; cost?: string; castTime?: string;
  range?: string; cooldown?: string; cooldownRemaining?: number; cooldownFraction?: number;
  tags?: string[]; warning?: string; proc?: boolean; count?: number; keybind?: string;
}
export interface RegistryEntry {
  id: string; name: string; category: string; description?: string; icon?: string;
  status?: string; progress?: number; total?: number; rewards?: string[]; hidden?: boolean;
  completedAt?: string; stats?: Stat[]; tags?: string[]; children?: RegistryEntry[];
}
export interface Quest extends RegistryEntry {
  region?: string; difficulty?: string; recommendedLevel?: number; tracked?: boolean;
  objectives?: { id: string; label: string; complete: boolean; children?: string[] }[];
  giver?: string; destination?: string; distance?: string; timer?: string;
}
export interface GraphNode extends RegistryEntry { x: number; y: number; prerequisites: string[]; state: 'locked' | 'available' | 'purchased' }
export interface Marker { id: string; label: string; x: number; y: number; kind: string; discovered?: boolean }
export interface Region { id: string; name: string; width: number; height: number; image?: string; markers: Marker[]; parentId?: string }
export interface Unit { id: string; name: string; level?: number; title?: string; portrait?: string; hp?: number; maxHp?: number; resource?: number; maxResource?: number; role?: string; status?: string; distance?: string; leader?: boolean; ready?: boolean; threat?: boolean; statuses?: string[] }
export interface Recipe extends RegistryEntry { station?: string; quality?: string; ingredients: { id: string; name: string; required: number; available: number }[]; output?: Item; bonuses?: string[] }
export interface ChatMessage { id: string; channel: string; author?: string; text: string; timestamp: string; link?: { kind: 'item' | 'player'; id: string; label: string } }
export interface Dialogue { speaker: string; portrait?: string; text: string; choices: { id: string; label: string; kind?: string }[] }
export interface EnchantmentPreview { phrase: string; interpretation: string; pattern: string; itemId: string; effect: string; details?: Stat[]; revision: string }
export interface SystemData {
  entries?: RegistryEntry[]; abilities?: Ability[]; quests?: Quest[]; nodes?: GraphNode[];
  regions?: Region[]; units?: Unit[]; recipes?: Recipe[]; items?: Item[]; messages?: ChatMessage[];
  sockets?: SocketModel[]; currencies?: Stat[]; dialogue?: Dialogue; preview?: EnchantmentPreview;
  queue?: RegistryEntry[]; progress?: number; options?: { id: string; label: string; description?: string }[];
}
export interface Receipt { ok: boolean; message?: string }
export interface SystemResource { state: LoadState; message?: string; revision?: number; data: SystemData; commands?: Readonly<Record<string, (args: Readonly<Record<string, unknown>>) => Promise<Receipt> | Receipt>> }
export type DragKind = 'item' | 'ability' | 'modifier' | 'recipe';
export interface DragPayload { kind: DragKind; id: string; source: string; index?: number; revision?: number }
export interface DropTarget { kind: string; accepts: string[]; revision?: number }
export interface WindowGeometry { x: number; y: number; width: number; height: number }
export interface WindowRecord extends WindowGeometry { id: string; status: 'closed' | 'opening' | 'open' | 'minimized' | 'dragging' | 'resizing'; modal?: boolean }
export interface WindowAction { type: 'open' | 'close' | 'toggle' | 'focus' | 'minimize' | 'move' | 'resize' | 'settle'; id: string; geometry?: Partial<WindowGeometry>; modal?: boolean }
export interface UiSettings { textScale: string; contrast: boolean; reducedMotion: boolean; tooltips: boolean; tooltipDelay: number; compact: boolean; hudOpacity: string; actionBars: boolean }
