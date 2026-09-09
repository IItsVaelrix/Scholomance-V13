# Scholomance MMORPG instrument layer

Date: 2026-09-08. Status: implementation authorized by the complete user brief.

## Audit and architecture

The React `/combat` route mounts Phaser through ArenaCombatView and the sole
phaser-runtime adapter. CombatPage owns sovereign verse/weave drafts, invocation,
results, bestiary, tactical overlays and discovery transitions. These remain.
App mounts independent inventory and character overlays globally; each owns its
own keyboard/Escape behavior. InventoryOverlay currently mixes persistence,
equipment mutation and presentation, renders double-click-only slots, native
title tooltips, and fabricated level/HP values. inventoryService is the existing
24-slot persistent authority and emits inventory-changed. Its persistence stores
item IDs only: stack/favorite/binding mechanics cannot be silently added there.
Character progression is per-stat XP, not a conventional character-level currency.
Combat publishes combat-stats-changed, combat-target-selected and scene-context-state.
Scene snapshots expose semantic world targets; they do not consistently expose
health, party positions or a terrain raster. WORLD_MAPS contains two regions.

## Decision

Use an additive React instrument layer on `/combat`, with a feature-local token
sheet, typed read models, instance-owned external subscriptions in a hook provider,
and explicit command adapters. Reuse existing item art. CSS/SVG own panel geometry;
no compiler or Phaser rendering changes are needed. Retain legacy global overlays
outside combat. Preserve incantation editing and all game authority.
A pure CSS reskin would preserve fragmented input/tooltips; replacing Phaser or
introducing a second gameplay store would increase regressions. Neither fits.

## UI SPEC

Component: src/ui/mmorpg/GameInterface.tsx and its primitive/system modules.
World-law: equipment is a semantic binding surface; progression is learned language;
windows are instruments into existing authoritative registries.
Data: existing inventory, stat XP, combat and scene events through gameUi.adapter.
State: hook-owned stores; independent channels for combat, inventory, scene, UI.
Accessibility: native buttons/inputs, focus restoration, Escape priority, keyboard
pickup/drop, visible focus, text state labels, reduced motion, persistent text scale.
School theming: consume active-school-color and school variables through semantic tokens.
Animation: short opacity/mechanical translation only; media-query reduced-motion guard.
Regression: inventory swapping, equipment event delivery, keyboard capture, combat
invocation, tutorial/loot/forest behavior, other route overlays.

## Hierarchy and tokens

GameUiProvider -> GameInterface -> HUD + launcher + WindowHost + TooltipHost + alerts.
WindowHost -> Window -> system-specific content composed from Panel, Tabs, Slot,
Meter, StatRow, SearchField, VirtualList, ItemCard, Socket and shared controls.
Palette: obsidian #101218, steel #252c38, inset #0b0e14, ivory #eeeae0,
muted #a9b3c3, school-derived energy. Rarity/state always includes words or symbols.
Central CSS variables cover spacing, type, surfaces, strokes, radii, depth, timing,
slot sizes, responsive widths and semantic layer aliases. Existing global z tiers
are used in nested stacking contexts, with DOM ordering for window focus.

## Contracts and interaction

Contracts in src/lib/mmorpg/contracts.ts describe presentation-only items, abilities,
records, sockets, units, quests, graph nodes, map markers and system resources.
Every future system resource has unavailable/loading/ready/error state, data and
an optional command port. Missing commands disable mutation. Commands return a
receipt and never optimistically award items, currency, talents or enchantments.
Window reducer supports open/close/toggle/focus/minimize/move/resize and bounds.
Positions are local presentation preferences, revalidated on viewport changes.
One tooltip owns delayed pointer and immediate focus content, collision handling,
Escape dismissal, descriptive association and item comparison.
One drag payload contract supports inventory/equipment/ability/socket/recipe; the
same validation/commit path serves pointer drag and keyboard pickup/place/cancel.
Input priority: modal, tooltip/drag, focused window, global UI shortcuts, game.
Text entry blocks game keystrokes. Controller commands use the same focus layer.

## Suite and integration boundaries

Live: inventory/equipment, character stat registry and XP, scene markers and
selected target, current combat actions, loot-granted notifications.
Retained: spellweave editor, compendium, bestiary, battle intro/results/tutorial.
Contract-backed: abilities, semantic progression graph, quests, crafting, enchanting,
vendor/buyback/repair, loot/group loot, party/raid, chat/social, codex, achievements,
collections, dialogue, encounters, death/revival and settings. No mock records ship.
Unsupported operations remain unavailable until a game adapter supplies capability.

## Execution and verification plan

1. Add behavioral tests for subscription isolation, bounded windows, stale/invalid
   drops and inventory conservation. Run tests to establish missing implementation.
2. Implement typed contracts, pure state transitions, adapter and localized hooks.
3. Implement shared primitives, windows, tooltips, drag/drop and keyboard focus.
4. Implement live HUD, inventory/equipment/character and reusable system screens.
5. Integrate only at App and CombatPage; preserve other routes and existing scene code.
6. Run scoped tests, lint, TypeScript and build. Run repository QA and report baseline
   failures independently. Verify real browser at 1280x800, 1920x1080, 2560x1440,
   3840x2160; inspect screenshots and perform keyboard/equipment/window interactions.
7. Dedicated fidelity pass; document exact evidence, incomplete ports and risks in PIR.

## Responsive, accessibility and performance

Steam Deck windows occupy usable viewport; desktop floats and resizes. HUD uses
compact tracks and wraps utility navigation; 4K increases type/spacing through
breakpoints. Critical health/action data remains independent of optional panels.
Long registries use bounded virtual rows with keyboard reveal and overscan. Combat
subscriptions update only combat consumers. Windows subscribe on demand; there is
no render-frame global React ticker. Tooltips and notifications share infrastructure.
No network calls or draft persistence are added by the presentation layer.
