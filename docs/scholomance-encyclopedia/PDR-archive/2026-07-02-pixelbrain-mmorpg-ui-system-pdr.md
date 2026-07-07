# PDR: PixelBrain MMORPG UI System

**Status:** Draft
**Classification:** Architectural | Behavioral | Structural | UI | PixelBrain | MMORPG Runtime
**Priority:** Critical
**Primary Goal:** Build a reusable PixelBrain-powered MMORPG UI operating layer whose canonical interface assets are deterministic lattice data and whose runtime projection can support a full fantasy MMO HUD, panels, input, accessibility, and combat feedback.

---

## Bytecode Search Code

`SCHOL-ENC-BYKE-SEARCH-PDR-PIXELBRAIN-MMORPG-UI-SYSTEM`

---

# 1. Executive Summary

Build a complete **PixelBrain MMORPG UI framework** that can power a full fantasy MMO interface using deterministic lattice assets, modular UI panels, QBIT-enhanced magical feedback, and scalable data-driven layouts.

The system should support:

- Player HUD
- Target HUD
- Party and raid frames
- Combat hotbars
- Written spellcasting interface
- Inventory and equipment
- Quest journal
- Skill tree
- Chat system
- Minimap and world map
- Guild, friends, trade, auction, crafting, and dungeon finder panels
- Boss mechanics warnings
- PixelBrain-styled visual themes
- MMORPG-grade accessibility, scaling, localization, and controller support

PixelBrain remains the source of truth through **integer-cell lattice data**. SVG, Canvas, WebGL, Godot, shader output, and PNG exports are projections.

---

# 2. Change Classification

## Architectural

This creates a reusable UI operating layer for a full MMORPG, not a single screen.

## Behavioral

The UI reacts to combat state, player state, spellcasting, cooldowns, quests, party health, buffs, debuffs, inventory changes, chat events, and world interactions.

## Structural

The system introduces shared UI schemas, panel registries, theme tokens, event bindings, asset registries, renderer adapters, and layout rules.

## Cosmetic

Visual polish matters, but cosmetic effects must derive from deterministic PixelBrain tokens and assets instead of one-off hardcoded images.

---

# 3. Product Goal

Create a **living magical command interface** where the UI feels like part of the world.

The player is not looking at floating buttons. The player is wearing a spell-forged operating system made of runes, glass, metal, parchment, sigils, meters, and animated lattice energy.

The UI must communicate mechanical information clearly while feeling like an artifact from Scholomance OS lore.

---

# 4. Why This Matters

MMORPG interfaces must handle extreme information density without becoming unreadable. PixelBrain reduces UI entropy by making UI elements:

- Deterministic
- Themeable
- Modular
- Inspectable
- Data-bound
- Visually magical
- Scalable across resolutions
- Exportable into multiple render targets

The core risk reduced is fragmented panel design. Every panel should share layout language, token rules, visual grammar, and event contracts.

---

# 5. Product Vision

PixelBrain MMORPG UI becomes a **fantasy operating system** for a game world.

It should combine:

- World of Warcraft information density
- Wakfu stylized fantasy readability
- Final Fantasy XIV combat utility
- Diablo gothic object permanence
- Scholomance OS magical terminal language
- Pixel art that can pulse, shimmer, and react without losing clarity

It must serve two audiences:

- **Players:** clear, beautiful, responsive, readable UI.
- **Developers:** easy panel creation, bindings, themes, testing, replay, and layout export.

---

# 6. Non-Negotiable Design Principles

## 6.1 Lattice First

All core UI components must be expressible as PixelBrain lattice assets.

```ts
type PixelBrainCell = {
  x: number;
  y: number;
  partId: string;
  color: string;
  shading?: string;
  emphasis?: string;
  slot?: string;
  isRim?: boolean;
  isMotif?: boolean;
};
```

SVG, Canvas, Godot Control nodes, WebGL shaders, and PNG exports are projections.

## 6.2 Deterministic Rendering

No random visual state unless seeded.

Avoid in canonical or replay-sensitive paths:

```ts
Math.random();
Date.now();
performance.now();
```

Use seeded runtime clocks and deterministic animation curves.

## 6.3 Modular Panels

Every UI element is a panel, widget, slot, text node, icon, bar, or grid.

Examples:

- `PlayerFrame`
- `TargetFrame`
- `Hotbar`
- `QuestTracker`
- `InventoryGrid`
- `SpellWritingPanel`
- `Minimap`
- `ChatBox`

## 6.4 Data Binding Over Manual Mutation

Panels must not manually dig through nested state everywhere.

Use bindings:

```ts
bind(PlayerFrame.healthBar.value, player.stats.hp.current);
bind(Hotbar.slot.cooldown, player.abilities[id].cooldownRemaining);
bind(QuestTracker.entries, quest.active);
```

## 6.5 Themes Are Data

Named design tokens control the UI theme.

Initial themes:

- `arcane_blue`
- `void_obsidian`
- `scholomance_gold`
- `blood_ritual`
- `forest_druidic`
- `celestial_silver`
- `necromancer_green`
- `infernal_paladin`

## 6.6 Combat Readability Wins

Beautiful effects must never hide vital game information. Health, mana, cast bars, cooldowns, debuffs, enemy warnings, and interaction prompts stay readable.

---

# 7. Primary User Stories

- As a player, I need to see health, resource, buffs, debuffs, level, XP, and combat state at all times.
- As a player, I need hotbars, cooldowns, spell charges, combo state, range warnings, cast bars, and target state.
- As a player, I need chat, friends, party, guild, trade, mail, invites, and group finder.
- As a player, I need tracked objectives, quest markers, dialogue panels, rewards, and map guidance.
- As a player, I need bags, equipment, item comparison, rarity, tooltips, sorting, stacking, search, and vendor actions.
- As a player, I need raid frames, boss warnings, mechanics timers, loot rolls, damage logs, dungeon objectives, and queue status.
- As a player, I need UI scaling, colorblind modes, font size options, reduced motion, remappable keybinds, and controller navigation.

---

# 8. Feature Overview

## 8.1 Core HUD

Required components:

| Component | Purpose |
| --- | --- |
| Player Frame | Health, resource, level, portrait |
| Target Frame | Enemy/player target info |
| Focus Frame | Secondary target tracking |
| Cast Bar | Player and enemy spellcasting |
| XP Bar | Progression visibility |
| Status Strip | Combat, rested, mounted, PvP flags |
| Interaction Prompt | Talk, loot, inspect, gather, open |

Player frame should feel like a carved magical nameplate with rune corners, lattice glass, animated resource liquid, damage cracks at low health, class accent bands, and sigil portrait frames.

## 8.2 Combat Hotbar System

Requirements:

- Multiple hotbars
- Drag and drop abilities
- Cooldown sweep
- Global cooldown overlay
- Charges
- Keybind labels
- Range indicators
- Resource cost indicators
- Proc glow
- Disabled state
- Combo sequence hints

Written spellcasting mode supports typed or drawn spell fragments:

```txt
frost.bind(target).slow(40).tick(3s)
GLACIA VINCULUM: TARGET, SLOW, FRACTURE
```

The system parses written spell intent, validates known spell grammar, and casts only if legal.

## 8.3 Spellbook

Requirements:

- Class spell list
- Passive abilities
- Active abilities
- Spell ranks
- Search
- School filters
- Drag to hotbar
- Tooltip preview
- Animation preview
- Written syntax examples

```ts
type SpellSchoolTheme = {
  schoolId: string;
  primaryColor: string;
  secondaryColor: string;
  latticeMotif: string;
  cooldownShape: "circle" | "rune_ring" | "crystal_wipe" | "ink_burn";
  procAnimation: string;
};
```

## 8.4 Inventory and Equipment

Required components:

| Component | Function |
| --- | --- |
| Bag Grid | Item slots |
| Equipment Panel | Character gear |
| Item Tooltip | Stats, rarity, lore |
| Compare Tooltip | Equipped vs hovered item |
| Sort Button | Organized inventory |
| Search Field | Find items |
| Currency Bar | Gold, tokens, premium currency |
| Vendor Panel | Buy, sell, repair |
| Loot Window | Item pickup |

```ts
type InventorySlot = {
  slotId: string;
  itemId?: string;
  quantity?: number;
  locked?: boolean;
  highlighted?: boolean;
  filter?: "gear" | "consumable" | "material" | "quest" | "junk";
};
```

Inventory should feel like a magical satchel grid with rune-lined item sockets, rarity glows, quest item borders, and broken-gear states.

## 8.5 Character Panel

Requirements:

- 3D or isometric character preview
- Equipment slots
- Stats
- Resistances
- Class traits
- Titles
- Cosmetics
- Mounts
- Pets
- Reputation
- Achievements

```ts
type CharacterStats = {
  level: number;
  health: StatPair;
  resource: StatPair;
  strength?: number;
  intellect?: number;
  agility?: number;
  spirit?: number;
  armor?: number;
  critChance?: number;
  haste?: number;
  mastery?: number;
  elementalResists?: Record<string, number>;
};
```

## 8.6 Quest Journal and Tracker

Requirements:

- Active quest tracker
- Full quest journal
- Objective progress
- Quest rewards
- NPC dialogue
- Map markers
- Abandon quest
- Share quest
- Party quest sync

```ts
type QuestObjective = {
  objectiveId: string;
  label: string;
  current: number;
  required: number;
  completed: boolean;
  locationHint?: string;
};
```

Quest UI should feel like a living codex: parchment base, ink bloom updates, rune seals, wax stamps, and glowing objective threads.

## 8.7 Chat System

Channels:

- Say
- Yell
- Whisper
- Party
- Raid
- Guild
- Trade
- System
- Combat Log
- Loot
- Emotes
- Looking For Group

```ts
type ChatMessage = {
  id: string;
  channel: ChatChannel;
  sender?: string;
  timestamp: number;
  body: string;
  links?: ChatLink[];
  severity?: "normal" | "warning" | "error" | "system";
};
```

Features include tabs, filters, timestamps, mentions, clickable players, item links, spell links, coordinates, moderation filters, copy, resize, and lock.

## 8.8 Party and Raid Frames

Party frames must support health, resource, role icon, class color, buffs, debuffs, range fade, dead state, ready check, and leader markers.

Raid frames must support groups, compact mode, heal prediction, shields, debuff priority, threat warnings, resurrection status, and boss mechanic markers.

Raid UI prioritizes healing, targeting, and debuff decisions over decoration.

## 8.9 Boss Mechanics UI

Required components:

- Boss health frame
- Phase indicator
- Enrage timer
- Cast warnings
- Raid-wide alerts
- Ground hazard warnings
- Stack/spread prompts
- Interrupt prompts
- Debuff countdowns

```ts
type BossWarningLevel = "info" | "caution" | "danger" | "lethal";

type BossMechanicWarning = {
  id: string;
  title: string;
  level: BossWarningLevel;
  countdownMs: number;
  affectedPlayers?: string[];
  recommendedAction: "interrupt" | "move" | "stack" | "spread" | "cleanse" | "defensive";
};
```

## 8.10 Minimap and World Map

Minimap requirements:

- Player position
- Party members
- Quest markers
- NPC markers
- Resource nodes
- Dungeon entrances
- PvP warnings
- Zoom
- Ping
- Coordinates
- Time/weather

World map requirements:

- Zone map
- Continent map
- Quest overlays
- Fast travel
- Fog of war
- Dungeon locations
- World boss timers
- Guild markers
- Custom markers

The minimap should look like a circular arcane lens with compass runes, pixel mist, quest seals, and class-colored motes.

## 8.11 Skill Tree

```ts
type SkillNode = {
  nodeId: string;
  name: string;
  description: string;
  maxRank: number;
  currentRank: number;
  prerequisites: string[];
  position: { x: number; y: number };
  nodeType: "passive" | "active" | "keystone" | "modifier";
};
```

Skill trees use lattice constellations: small passives as stars, actives as glyph circles, keystones as large sigils, and build paths as glowing veins.

## 8.12 Crafting UI

```ts
type CraftingRecipe = {
  recipeId: string;
  profession: string;
  name: string;
  requiredLevel: number;
  ingredients: IngredientRequirement[];
  outputItemId: string;
  craftTimeMs?: number;
  qualityRange?: [number, number];
};
```

## 8.13 Auction House and Trading

Economy interfaces must include strong confirmation states and change warnings. Requirements include search, filters, categories, price history, buyout, bidding, listing, expiration, stack splitting, recommended price, two-player trade slots, lock trade, confirm trade, and trade-changed warnings.

## 8.14 Guild and Social Panels

Guild panels support roster, ranks, MOTD, guild chat, guild bank, permissions, events, recruitment, and contribution logs.

Friends panels support online friends, recent players, ignore list, party invite, whisper, inspect, and notes.

## 8.15 Dungeon Finder and PvP Queue

```ts
type QueueState = {
  queueId: string;
  type: "dungeon" | "raid" | "pvp" | "world_event";
  rolesSelected: string[];
  estimatedWaitMs?: number;
  status: "idle" | "queued" | "ready" | "inside" | "locked";
};
```

---

# 9. Layout System

```ts
type UILayoutNode = {
  id: string;
  type: "panel" | "widget" | "slot" | "text" | "icon" | "bar" | "grid";
  anchor: UIAnchor;
  position: { x: number; y: number };
  size: { w: number; h: number };
  scale?: number;
  locked?: boolean;
  visible?: boolean;
  children?: UILayoutNode[];
};

type UIAnchor =
  | "top_left"
  | "top"
  | "top_right"
  | "left"
  | "center"
  | "right"
  | "bottom_left"
  | "bottom"
  | "bottom_right";
```

Players should eventually be able to move, resize, lock, hide, scale, save, import, and export UI layouts.

---

# 10. PixelBrain UI Asset Model

```ts
type PixelBrainUIPacket = {
  schemaVersion: "pixelbrain.ui.mmorpg.v1";
  id: string;
  name: string;
  themeId: string;
  lattice: PixelBrainCell[];
  layout: UILayoutNode[];
  bindings: UIBinding[];
  animations: UIAnimation[];
  accessibility: UIAccessibilityConfig;
  metadata: {
    author?: string;
    createdAtSeed?: string;
    tags: string[];
  };
};

type UIBinding = {
  bindingId: string;
  sourcePath: string;
  targetNodeId: string;
  targetProperty: string;
  transform?: string;
  fallback?: unknown;
};
```

Example:

```ts
{
  bindingId: "player_health",
  sourcePath: "player.stats.health.current",
  targetNodeId: "player_health_bar",
  targetProperty: "value",
  transform: "ratio(player.stats.health.max)"
}
```

---

# 11. UI Event System

Events:

```ts
type UIEvent =
  | "PLAYER_HEALTH_CHANGED"
  | "PLAYER_RESOURCE_CHANGED"
  | "TARGET_CHANGED"
  | "SPELL_CAST_STARTED"
  | "SPELL_CAST_INTERRUPTED"
  | "SPELL_CAST_COMPLETE"
  | "COOLDOWN_STARTED"
  | "COOLDOWN_READY"
  | "BUFF_ADDED"
  | "BUFF_REMOVED"
  | "QUEST_UPDATED"
  | "ITEM_LOOTED"
  | "CHAT_MESSAGE_RECEIVED"
  | "PARTY_MEMBER_UPDATED"
  | "BOSS_MECHANIC_WARNING";

type UIEventEnvelope<T> = {
  eventId: string;
  type: UIEvent;
  timestampTick: number;
  payload: T;
};
```

Use `timestampTick`, not wall-clock time, for deterministic replay.

---

# 12. Visual System

```ts
type UITheme = {
  id: string;
  name: string;
  palette: {
    background: string;
    panel: string;
    rim: string;
    textPrimary: string;
    textSecondary: string;
    danger: string;
    warning: string;
    success: string;
    mana: string;
    health: string;
    energy: string;
  };
  typography: {
    bodyFont: string;
    titleFont: string;
    numberFont: string;
  };
  motifs: {
    corner: string;
    divider: string;
    slotFrame: string;
    barFill: string;
    procGlow: string;
  };
};
```

Core interactive states:

- Normal
- Hover
- Pressed
- Disabled
- Selected
- Focused
- Warning
- Error
- Magical proc
- Cooldown
- Out of range
- Insufficient resource

---

# 13. Animation System

Animations are deterministic and state-driven.

```ts
type UIAnimation = {
  animationId: string;
  targetNodeId: string;
  trigger: UIEvent | "state";
  curve: "linear" | "ease_in" | "ease_out" | "pulse" | "step";
  durationTicks: number;
  properties: UIAnimationProperty[];
};
```

Examples:

| Event | Animation |
| --- | --- |
| Low health | Frame cracks pulse slowly |
| Cooldown ready | Rune ring flashes once |
| Quest complete | Wax seal stamps onto tracker |
| Legendary loot | Slot border ignites |
| Boss warning | Center sigil expands |
| Spell proc | Hotbar icon breathes light |
| Debuff critical | Raid frame edge burns |

Global ambient breathing must not destabilize combat-critical HUD geometry.

---

# 14. Accessibility Requirements

Required:

- UI scale from 75 percent to 200 percent
- Font size control
- Colorblind palettes
- Reduced motion mode
- High contrast mode
- Screen reader labels where supported
- Controller navigation
- Keyboard-only navigation
- Custom keybinds
- Combat text size controls
- Chat filter controls

Accessibility is foundational, not a post-launch patch.

---

# 15. Performance Requirements

| Area | Target |
| --- | --- |
| HUD render update | Under 2 ms average |
| Combat event reaction | Under 1 frame |
| Inventory opening | Under 50 ms |
| Search/filter response | Under 100 ms |
| Layout save/load | Under 20 ms |
| Raid frame update | Stable with 40 players |
| Animation overhead | No major frame spikes |

Optimization rules:

- Cache lattice projections.
- Batch UI updates.
- Avoid re-rendering unchanged panels.
- Use dirty flags.
- Separate combat-critical UI from decorative UI.
- Disable non-essential particles in raid mode.
- Use deterministic animation timelines.

---

# 16. Data Flow

```txt
Game State
  ↓
UI Event Bus
  ↓
Binding Layer
  ↓
PixelBrain UI Layout Nodes
  ↓
Renderer Projection
  ↓
Player Screen
```

Renderer targets:

- DOM/SVG
- Canvas
- WebGL
- Godot Control nodes
- Godot CanvasLayer
- Remotion export
- Static PNG/SVG export for mockups

---

# 17. Dependency Check

Game-state dependencies:

- Player stats
- Target stats
- Party and raid state
- Ability and cooldown systems
- Buff/debuff system
- Inventory system
- Quest system
- Chat system
- Map system
- Crafting system
- Guild/social system
- Economy system

Shared infrastructure:

- Event bus
- Asset registry
- Theme registry
- Layout registry
- Input manager
- Localization manager
- Save/load manager
- Renderer adapter

Panels must use selectors, bindings, and event envelopes, not direct raw-state coupling.

---

# 18. Module Architecture

```txt
pixelbrain-ui/
  core/
    types.ts
    eventBus.ts
    bindings.ts
    layoutEngine.ts
    themeRegistry.ts
    assetRegistry.ts
    animationEngine.ts

  panels/
    PlayerFrame/
    TargetFrame/
    Hotbar/
    Spellbook/
    Inventory/
    CharacterPanel/
    QuestTracker/
    QuestJournal/
    Chat/
    PartyFrames/
    RaidFrames/
    Minimap/
    WorldMap/
    SkillTree/
    Crafting/
    AuctionHouse/
    Guild/
    Social/
    DungeonFinder/
    BossWarnings/

  renderers/
    svgRenderer.ts
    canvasRenderer.ts
    godotRenderer.ts
    webglRenderer.ts

  presets/
    defaultLayout.ts
    raidLayout.ts
    controllerLayout.ts
    minimalistLayout.ts

  themes/
    arcaneBlue.ts
    voidObsidian.ts
    bloodRitual.ts
    celestialSilver.ts

  testing/
    mockGameState.ts
    combatReplayFixtures.ts
    layoutSnapshots.ts
```

Current implementation home for the Scholomance OS prototype:

```txt
Scholomance OS/client/pixelbrain-ui/
```

---

# 19. MVP Scope

## Phase 1: Core Shell

Build:

- UI event bus
- Layout engine
- Theme registry
- Asset registry
- Canvas renderer
- Player frame
- Target frame
- Hotbar
- Chat box
- Quest tracker

Success criteria:

- UI loads from packet.
- Panels bind to mock game state.
- Health/resource changes update correctly.
- Hotbar cooldowns animate.
- Layout can be saved and restored.

## Phase 2: MMORPG Essentials

Build inventory, equipment, spellbook, party frames, minimap, quest journal, tooltips, and buff/debuff tracking.

## Phase 3: Advanced Combat

Build raid frames, boss warnings, proc system, cast warnings, written spellcasting panel, combat log, and floating combat text.

## Phase 4: Full MMORPG Layer

Build guild, friends, auction house, crafting, dungeon finder, PvP queue, mail, achievements, reputation, mounts, and pets.

---

# 20. Example Default Screen Layout

```txt
[Top Left]      Player Frame
[Top Center]    Target Frame / Boss Frame
[Top Right]     Minimap

[Left]          Quest Tracker
[Center]        Boss Warnings / Interaction Prompts
[Bottom Left]   Chat
[Bottom Center] Hotbars / Resource Strip
[Bottom Right]  Bags / Menu Buttons

[Hidden Panels]
Inventory
Character
Spellbook
Quest Journal
Guild
Auction House
Crafting
World Map
Skill Tree
```

---

# 21. Example PixelBrain HUD Packet

```ts
const playerHudPacket: PixelBrainUIPacket = {
  schemaVersion: "pixelbrain.ui.mmorpg.v1",
  id: "hud.default.arcane.v1",
  name: "Default Arcane MMORPG HUD",
  themeId: "arcane_blue",
  lattice: [],
  layout: [
    {
      id: "player_frame",
      type: "panel",
      anchor: "top_left",
      position: { x: 24, y: 24 },
      size: { w: 320, h: 96 },
      locked: false,
      visible: true,
      children: [
        {
          id: "player_health_bar",
          type: "bar",
          anchor: "left",
          position: { x: 16, y: 18 },
          size: { w: 260, h: 22 }
        },
        {
          id: "player_resource_bar",
          type: "bar",
          anchor: "left",
          position: { x: 16, y: 48 },
          size: { w: 260, h: 18 }
        }
      ]
    }
  ],
  bindings: [
    {
      bindingId: "player_health",
      sourcePath: "player.stats.health.current",
      targetNodeId: "player_health_bar",
      targetProperty: "value",
      transform: "ratio(player.stats.health.max)"
    }
  ],
  animations: [],
  accessibility: {
    scale: 1,
    reducedMotion: false,
    highContrast: false,
    colorblindMode: "none"
  },
  metadata: {
    tags: ["hud", "mmorpg", "arcane", "default"]
  }
};
```

---

# 22. Tooltip System

Tooltips must support items, spells, buffs, debuffs, NPCs, players, quest objectives, currencies, crafting materials, and skill nodes.

```ts
type UITooltip = {
  id: string;
  title: string;
  subtitle?: string;
  rarity?: "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic";
  body: TooltipLine[];
  comparison?: TooltipComparison;
  actions?: TooltipAction[];
};
```

---

# 23. Input System

Required inputs:

- Mouse
- Keyboard
- Controller
- Optional touch
- Gamepad radial menus
- Keybind remapping
- Drag and drop
- Modifier keys
- Long press
- Context menu

```ts
type UIInputLayer =
  | "gameplay"
  | "chat"
  | "menu"
  | "dragging"
  | "modal"
  | "controller_navigation";
```

---

# 24. Localization

All text must be tokenized.

```ts
type LocalizedTextToken = {
  key: string;
  fallback: string;
  params?: Record<string, string | number>;
};
```

Example:

```ts
{
  key: "quest.objective.kill_count",
  fallback: "Defeat {current}/{required} enemies",
  params: {
    current: 4,
    required: 10
  }
}
```

---

# 25. Save System

```ts
type SavedUILayout = {
  layoutId: string;
  characterId: string;
  accountId: string;
  themeId: string;
  nodes: UILayoutNode[];
  keybinds: Record<string, string>;
  panelVisibility: Record<string, boolean>;
  updatedAtTick: number;
};
```

---

# 26. QA Requirements

## Core Rendering

- [ ] UI packet loads without schema errors.
- [ ] Lattice assets render correctly.
- [ ] Panels anchor correctly at multiple resolutions.
- [ ] Scaling works from 75 percent to 200 percent.
- [ ] Theme swap does not break layout.
- [ ] Missing asset fallback works.

## HUD

- [ ] Health updates correctly.
- [ ] Resource updates correctly.
- [ ] XP bar updates correctly.
- [ ] Player death state appears.
- [ ] Low health warning appears.
- [ ] Target swap updates target frame.
- [ ] Cast bar interrupts correctly.

## Hotbar

- [ ] Abilities can be assigned.
- [ ] Cooldowns display correctly.
- [ ] Global cooldown displays correctly.
- [ ] Out-of-range state works.
- [ ] Insufficient-resource state works.
- [ ] Proc glow appears and clears.
- [ ] Keybind labels update.

## Inventory

- [ ] Items display in correct slots.
- [ ] Tooltips show correct stats.
- [ ] Item comparison works.
- [ ] Sorting works.
- [ ] Search works.
- [ ] Drag and drop works.
- [ ] Vendor sell/repair works.

## Questing

- [ ] Quest tracker updates objective progress.
- [ ] Completed objectives receive visual state.
- [ ] Quest journal opens correctly.
- [ ] Rewards display correctly.
- [ ] Map markers sync with active quests.

## Chat

- [ ] Channels filter correctly.
- [ ] Whisper works.
- [ ] Item links render.
- [ ] Spell links render.
- [ ] Combat log does not flood main chat.
- [ ] Timestamps obey settings.

## Party/Raid

- [ ] Party frames update health.
- [ ] Raid frames support 40 players.
- [ ] Debuffs show priority correctly.
- [ ] Range fade works.
- [ ] Death states work.
- [ ] Ready check works.
- [ ] Raid warnings do not obscure critical frames.

## Accessibility

- [ ] High contrast mode works.
- [ ] Reduced motion mode works.
- [ ] Colorblind palettes are readable.
- [ ] Controller navigation reaches all panels.
- [ ] Keyboard-only navigation works.
- [ ] Chat font size can be increased.

## Performance

- [ ] Raid combat replay does not spike.
- [ ] Inventory open time stays under target.
- [ ] UI animations do not exceed budget.
- [ ] Dirty-flag updates avoid full redraws.
- [ ] Renderer adapter does not mutate canonical packet.

---

# 27. Regression Risks

| Risk | Mitigation |
| --- | --- |
| Combat clarity loss | Combat-critical UI has priority over decoration. |
| Layout drift | Use shared layout schema and renderer snapshot tests. |
| State coupling | Use event bus and bindings only. |
| Theme breakage | Add theme contrast validation. |
| Raid performance collapse | Raid mode reduces decorative effects. |
| Written spellcasting ambiguity | Use strict grammar, previews, validation errors, and known spell contracts. |

---

# 28. Recommended Retest Scenarios

## Scenario 1: Solo Combat

Damage player, heal player, target enemy, cast spell, trigger cooldown, receive loot, complete quest objective.

Expected: HUD, target frame, hotbar, loot, and quest tracker update correctly.

## Scenario 2: Dungeon Party

Load 5 players, damage tank, apply poison debuff, trigger boss cast, complete dungeon objective, roll on loot.

Expected: Party frames, debuffs, boss warning, loot roll, and objective tracker work.

## Scenario 3: Raid Stress Test

Load 40 players, apply raid-wide damage, add debuffs, trigger boss warnings, update combat log rapidly.

Expected: no unreadable clutter, no frame spikes, raid frames stay accurate.

## Scenario 4: Economy

Open auction house, search item, sort by price, list item, buy item, confirm purchase.

Expected: no stale prices, no accidental purchase, clear confirmation.

## Scenario 5: Accessibility

Increase UI scale to 200 percent, enable high contrast, enable reduced motion, navigate with controller.

Expected: all major UI remains usable.

---

# 29. Implementation Order

1. Types and schema definitions
2. Event bus
3. Theme registry
4. Layout engine
5. Renderer adapter
6. Player frame
7. Target frame
8. Hotbar
9. Tooltip system
10. Chat
11. Quest tracker
12. Inventory
13. Spellbook
14. Party frames
15. Minimap
16. Raid frames
17. Boss warnings
18. Written spellcasting panel
19. Social/economy systems
20. Full layout editor

---

# 30. Definition of Done

The system is viable when:

- Every major MMO panel has a schema-backed implementation.
- Layouts are editable and saveable.
- Themes are swappable.
- Combat UI remains readable under stress.
- Raid frames support 40 players.
- Hotbars and cooldowns work.
- Tooltips support items, spells, buffs, and quests.
- Chat supports multiple channels.
- Inventory and equipment are functional.
- Written spellcasting validates input.
- UI state can be replayed deterministically.
- Renderers do not mutate canonical PixelBrain assets.
- Accessibility options are present from the beginning.

---

# 31. Final Target

The final system should feel like a **PixelBrain Arcane Desktop for MMORPGs**.

The result is not merely a HUD. It is the **MMORPG nervous system** of PixelBrain:

- Health as enchanted glass
- Mana as flowing lattice liquid
- Quests as living parchment
- Skills as constellations
- Inventory as rune sockets
- Chat as a spellbound message stream
- Boss warnings as urgent sigils
- Written magic as a true gameplay input layer

