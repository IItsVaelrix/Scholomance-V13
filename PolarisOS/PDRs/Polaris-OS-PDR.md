# Product Design Requirements

## Picture-Book MUD MVP

**Working title:** Codex Vale
**Document status:** MVP Definition
**Product type:** Persistent multiplayer literary game
**Primary platform:** Desktop and mobile web
**Architecture classification:** Custom deterministic game engine with conventional infrastructure
**MVP proof:** Three rooms, two concurrent players, one shared object, and one persistent illustrated world mutation

---

# 1. Summary

The Picture-Book MUD is a multiplayer persistent world presented through illustrated storybook scenes, literary descriptions, natural-language commands, and shared environmental history.

Players inhabit the same authoritative world. Their actions alter room state, object ownership, narrative output, and selected visual elements. Illustrations communicate world state but never determine it.

The MVP must prove the complete causal chain:

```text
Player language
→ command interpretation
→ authoritative validation
→ deterministic world mutation
→ persistent event
→ shared narrative update
→ visual scene update
```

The MVP is successful when two players can enter the same world, observe each other, compete for a shared object, cause a visible persistent room mutation, disconnect, reconnect, and observe the correct restored state.

---

# 2. Product Thesis

Traditional MUDs scale through language but provide little visual presence. Illustrated games offer atmosphere but usually depend on fixed authored scenes and expensive asset production.

The Picture-Book MUD combines:

* the systemic persistence of a MUD
* the readability of an illustrated book
* the social presence of a shared online world
* the scalability of procedural content
* the visual flexibility of AI-assisted art
* the reliability of deterministic simulation

The illustration is not decorative wallpaper. It is a projection of authoritative world state.

> The world produces the picture. The picture does not produce the world.

---

# 3. MVP Objective

## Primary objective

Prove that a persistent multiplayer world can be represented as a synchronized illustrated page without allowing the illustration, language model, or client application to become authoritative.

## Required demonstration

The MVP world contains:

* one world
* three connected rooms
* two simultaneous players
* one shared portable object
* one interactable environmental object
* one persistent visual mutation
* one narrative event feed
* one command input
* one reconnect and restoration path

## Example scenario

1. Player One enters the ruined shrine.
2. Player Two enters from the forest path.
3. Both players see each other in the room.
4. Both attempt to take the same lantern.
5. The server accepts only the first valid command.
6. The lantern appears in the successful player’s inventory.
7. The room illustration removes the lantern from its original position.
8. The successful player lights the shrine brazier.
9. The brazier becomes permanently lit.
10. Both players receive updated prose and visual state.
11. Both disconnect.
12. The server restarts.
13. A returning player sees the lantern owner and lit brazier restored correctly.

---

# 4. Why This MVP

The MVP intentionally avoids proving content scale, procedural world generation, combat depth, or advanced AI narration.

It instead proves the highest-risk architectural junctions:

| Risk                        | MVP proof                                       |
| --------------------------- | ----------------------------------------------- |
| Multiplayer race conditions | Two players compete for one object              |
| Authoritative state         | Server resolves all actions                     |
| Persistence                 | Room mutation survives restart                  |
| Visual synchronization      | Scene changes follow world events               |
| Natural-language ambiguity  | Commands resolve or request clarification       |
| Reconnection                | Returning players receive current state         |
| AI isolation                | World remains playable without image generation |
| Architectural modularity    | Kernel remains independent from infrastructure  |

This reduces the risk of building a large content system on top of an unstable simulation foundation.

---

# 5. Product Principles

## 5.1 World authority

The server owns all world truth.

Clients may request actions but may never directly mutate:

* inventory
* room membership
* object location
* environmental state
* quest state
* visual state
* player visibility

## 5.2 Deterministic resolution

The same valid state, command, and ruleset version must produce the same result.

```text
State + Command + Ruleset = Domain Events
```

AI-generated prose or images may describe an event but may not decide its result.

## 5.3 Visual projection

Illustrations are generated from a structured scene manifest.

A scene manifest may reference:

* background artwork
* entity layers
* prop layers
* lighting overlays
* environmental effects
* interactable hotspots
* visual damage
* visual state flags

## 5.4 Graceful degradation

The world must remain fully playable when:

* image generation is unavailable
* an image asset fails to load
* a visual layer is missing
* the prose generator is disabled
* the client reconnects after missing updates

## 5.5 Explicit ambiguity

The command system must refuse or clarify uncertain interpretation.

It must not silently guess when multiple plausible targets or actions exist.

## 5.6 Persistent causality

Meaningful world changes must survive:

* player disconnection
* client refresh
* server restart
* process crash after successful commit

---

# 6. Target User Experience

## 6.1 Primary interface

The screen contains:

1. Illustrated room scene
2. Room title and description
3. Visible players and entities
4. Recent narrative events
5. Command input
6. Inventory panel
7. Connection and synchronization status

## 6.2 Core interaction loop

```text
Observe
→ type command
→ receive interpretation
→ server resolves action
→ read consequence
→ observe changed scene
```

## 6.3 Supported command examples

```text
look
look at lantern
take lantern
drop lantern
go east
enter shrine
light brazier
inventory
say The rain is getting worse.
```

The MVP may support controlled natural-language variants:

```text
pick up the lantern
grab the lantern
walk east
inspect the broken brazier
```

## 6.4 Ambiguity response

When a command contains multiple valid interpretations:

```text
> take key

Which key do you mean?

1. Rusted iron key
2. Small brass key
```

No mutation occurs until the command is resolved.

---

# 7. Scope

## 7.1 P0 requirements

P0 requirements are mandatory for MVP completion.

### World

* One persistent world instance
* Three rooms connected through explicit exits
* Room-level revision number
* Room-level serialized command processing
* Persistent players, objects, and environmental flags

### Multiplayer

* At least two simultaneous connected players
* Player entry and departure events
* Shared observation of room occupants
* Shared narrative updates
* Race-safe competition for one object

### Commands

* Command input through text
* Deterministic action binding
* Target entity resolution
* Explicit refusals
* Explicit ambiguity handling
* No direct client-authored state mutation

### Persistence

* SQLite WAL database
* Atomic command transaction
* Append-only domain event record
* Materialized current state
* Restart restoration
* Basic snapshot support

### Illustration

* One base illustration per room
* Layered portable object rendering
* Layered player or character markers
* One persistent environmental mutation
* Scene manifest generated from world state
* Fallback text presentation when visual assets fail

### Realtime synchronization

* WebSocket connection
* Initial room snapshot
* Ordered event updates
* Revision and sequence tracking
* Client resynchronization after missed events

### Testing

* Kernel unit tests
* Multiplayer race-condition test
* Persistence restart test
* Scene-manifest determinism test
* Reconnection test

## 7.2 P1 requirements

P1 requirements are valuable but may be deferred if they threaten the MVP schedule.

* Account authentication
* Character creation
* Chat history persistence
* Basic admin inspection panel
* Mobile-specific layout refinement
* Page-turn animation
* Ambient room audio
* Command autocomplete
* Event replay inspector
* World snapshot export

## 7.3 Explicit non-goals

The MVP will not include:

* combat
* crafting
* procedural world generation
* generated quests
* player housing
* guilds
* economy
* trading
* advanced NPC simulation
* voice input
* live AI image generation during ordinary commands
* unrestricted LLM command execution
* user-generated world building
* native mobile applications
* thousands of simultaneous players
* cross-world travel
* moderation automation

These features are postponed until the authoritative world loop is proven.

---

# 8. Technical Architecture

## 8.1 Recommended stack

| Concern                    | Technology                                  |
| -------------------------- | ------------------------------------------- |
| Language                   | TypeScript                                  |
| Client                     | Vite with existing UI framework             |
| Illustrated renderer       | PixiJS                                      |
| Text and controls          | DOM                                         |
| Server                     | Fastify                                     |
| Realtime transport         | WebSocket                                   |
| Database                   | SQLite in WAL mode                          |
| Validation                 | Zod or equivalent schema library            |
| Unit and integration tests | Vitest                                      |
| End-to-end tests           | Playwright                                  |
| Asset storage              | Local filesystem for MVP                    |
| Monorepo                   | npm, pnpm, or existing workspace convention |

## 8.2 Architectural boundary

```text
Applications
├── client
├── server
├── world studio
└── art worker

Adapters
├── WebSocket
├── Fastify
├── SQLite
├── PixiJS
└── filesystem assets

Core
├── contracts
├── world kernel
├── command binder
├── narrative projector
└── scene compiler
```

Core packages must not import application or infrastructure packages.

## 8.3 Dependency law

```text
contracts
    ↑
world-kernel
    ↑
projectors and adapters
    ↑
applications
```

The world kernel may not import:

* Fastify
* WebSocket libraries
* SQLite drivers
* PixiJS
* browser APIs
* image-generation SDKs
* UI components

---

# 9. Repository Structure

```text
picture-book-mud/
├── apps/
│   ├── client/
│   ├── server/
│   └── world-studio/
│
├── packages/
│   ├── contracts/
│   ├── world-kernel/
│   ├── command-language/
│   ├── narrative-projector/
│   ├── scene-compiler/
│   ├── realtime-protocol/
│   ├── persistence-sqlite/
│   ├── renderer-pixi/
│   └── test-harness/
│
├── worldpacks/
│   └── shrine-demo/
│       ├── world.json
│       ├── rooms/
│       ├── entities/
│       ├── rules/
│       └── assets/
│
└── tests/
    ├── integration/
    ├── replay/
    ├── persistence/
    └── visual-contracts/
```

---

# 10. Core Domain Model

## 10.1 World state

```ts
export interface WorldState {
  worldId: string;
  revision: number;
  rulesetVersion: string;
  rooms: Record<string, RoomState>;
  players: Record<string, PlayerState>;
  entities: Record<string, EntityState>;
}
```

## 10.2 Room state

```ts
export interface RoomState {
  roomId: string;
  revision: number;
  title: string;
  descriptionKey: string;
  exitIds: string[];
  occupantIds: string[];
  entityIds: string[];
  flags: Record<string, boolean | string | number>;
}
```

## 10.3 Entity state

```ts
export interface EntityState {
  entityId: string;
  entityType: "object" | "environment" | "character";
  definitionId: string;
  location:
    | { type: "room"; roomId: string }
    | { type: "inventory"; playerId: string };
  flags: Record<string, boolean | string | number>;
}
```

## 10.4 Player state

```ts
export interface PlayerState {
  playerId: string;
  displayName: string;
  roomId: string;
  inventoryIds: string[];
  connectionState: "connected" | "disconnected";
}
```

---

# 11. Command Contract

## 11.1 Client request

```ts
export interface SubmitCommandMessage {
  type: "command.submit";
  commandId: string;
  playerId: string;
  roomId: string;
  expectedRevision: number;
  rawInput: string;
}
```

## 11.2 Bound command

```ts
export interface BoundCommand {
  commandId: string;
  actorId: string;
  roomId: string;
  action: ActionType;
  targetIds: string[];
  arguments: Record<string, unknown>;
  evidence: BindingEvidence[];
}
```

## 11.3 Supported MVP actions

```ts
export type ActionType =
  | "LOOK"
  | "EXAMINE"
  | "MOVE"
  | "TAKE"
  | "DROP"
  | "ACTIVATE"
  | "INVENTORY"
  | "SAY";
```

## 11.4 Resolution contract

```ts
export type CommandResolution =
  | {
      accepted: true;
      events: DomainEvent[];
    }
  | {
      accepted: false;
      refusal:
        | "INVALID_ACTION"
        | "TARGET_NOT_FOUND"
        | "TARGET_AMBIGUOUS"
        | "TARGET_UNAVAILABLE"
        | "REVISION_CONFLICT"
        | "PERMISSION_DENIED";
      alternatives?: CommandAlternative[];
    };
```

---

# 12. Domain Events

## 12.1 Base event

```ts
export interface DomainEvent<TPayload = unknown> {
  eventId: string;
  worldId: string;
  roomId: string | null;
  sequence: number;
  worldRevision: number;
  eventType: string;
  actorId: string | null;
  payload: TPayload;
  rulesetVersion: string;
  occurredAt: string;
}
```

## 12.2 Required event types

```text
PLAYER_ENTERED_ROOM
PLAYER_LEFT_ROOM
PLAYER_CONNECTED
PLAYER_DISCONNECTED
ENTITY_TAKEN
ENTITY_DROPPED
ENTITY_ACTIVATED
ROOM_FLAG_CHANGED
PLAYER_SPOKE
COMMAND_REFUSED
```

## 12.3 Example event

```json
{
  "eventType": "ENTITY_ACTIVATED",
  "actorId": "player_01",
  "roomId": "ruined_shrine",
  "payload": {
    "entityId": "shrine_brazier",
    "activation": "lit"
  },
  "rulesetVersion": "mvp-1"
}
```

---

# 13. Persistence Design

## 13.1 Required tables

```text
worlds
rooms
players
entities
domain_events
world_snapshots
scene_manifests
```

## 13.2 Transaction rule

Every accepted command must perform one atomic transaction:

1. Verify expected revision
2. Validate command
3. Produce domain events
4. Append events
5. Update materialized state
6. Increment revision
7. Commit transaction
8. Broadcast result

A command must never broadcast before persistence succeeds.

## 13.3 Failure behavior

When persistence fails:

* no event is broadcast
* no in-memory mutation is retained
* the command receives a failure response
* the failure is recorded in server logs
* the room actor reloads authoritative state when necessary

## 13.4 Restart restoration

On server startup:

1. Load latest snapshot
2. Load events after snapshot sequence
3. Replay remaining events
4. Reconstruct current state
5. Validate revision consistency
6. Open the world to connections

---

# 14. Concurrency Model

## 14.1 Room actor

Each active room has a serialized command queue.

```ts
export interface RoomActor {
  roomId: string;
  enqueue(command: BoundCommand): Promise<CommandResolution>;
  getRevision(): number;
}
```

## 14.2 Competing command example

Both players submit:

```text
take lantern
```

Required outcome:

* first valid command acquires the lantern
* room revision increments
* second command is evaluated against updated state
* second command receives `TARGET_UNAVAILABLE`
* only one `ENTITY_TAKEN` event exists

## 14.3 Cross-room actions

Cross-room actions are outside MVP scope.

Movement is handled as a controlled transition involving:

* departure from source room
* player location update
* entry into destination room
* source room broadcast
* destination room broadcast

---

# 15. Scene Compiler

## 15.1 Purpose

The scene compiler converts authoritative room state into a deterministic visual contract.

```text
Room state
→ visual projection
→ scene manifest
→ client rendering
```

## 15.2 Scene manifest

```ts
export interface SceneManifest {
  sceneId: string;
  roomId: string;
  roomRevision: number;
  visualRevision: number;
  backgroundAssetKey: string;
  layers: SceneLayer[];
  hotspots: SceneHotspot[];
  textRegions: SceneTextRegion[];
  contractHash: string;
}
```

## 15.3 Scene layer

```ts
export interface SceneLayer {
  layerId: string;
  assetKey: string;
  depth: number;
  visible: boolean;
  anchor: { x: number; y: number };
  stateKey?: string;
}
```

## 15.4 Determinism requirement

The same room state and scene-compiler version must produce the same:

* layer ordering
* asset references
* hotspot list
* visual state
* contract hash

## 15.5 MVP visual mutation

The shrine brazier supports:

```text
unlit
lit
```

When lit:

* `brazier_unlit` layer becomes hidden
* `brazier_lit` layer becomes visible
* `warm_light_overlay` becomes visible
* room description changes
* the state persists after restart

---

# 16. Client Rendering

## 16.1 PixiJS responsibilities

* scene backgrounds
* prop layers
* character markers
* environmental overlays
* lighting
* interactable hotspots
* simple transitions

## 16.2 DOM responsibilities

* room prose
* command input
* narrative feed
* inventory
* connection status
* ambiguity options
* accessibility labels

## 16.3 Fallback behavior

When PixiJS or an asset fails:

* room title remains visible
* room description remains visible
* visible entities are listed as text
* exits remain usable
* commands remain available
* game state remains synchronized

---

# 17. Realtime Protocol

## 17.1 Client messages

```text
connection.identify
room.join
command.submit
chat.send
state.resync.request
```

## 17.2 Server messages

```text
connection.ready
room.snapshot
command.accepted
command.refused
domain.events
scene.patch
state.resync.required
server.error
```

## 17.3 Ordering fields

Every state-bearing server message must include:

```ts
interface RevisionEnvelope {
  worldId: string;
  roomId: string;
  sequence: number;
  roomRevision: number;
}
```

## 17.4 Missed update handling

When the client receives a sequence gap:

1. Pause local scene patch application
2. Request room resynchronization
3. Receive a complete snapshot
4. Replace local projected state
5. Resume incremental updates

---

# 18. Narrative Projection

## 18.1 Purpose

Domain events are converted into player-readable prose.

Example:

```text
ENTITY_TAKEN
→ Vaelrix lifts the lantern from the broken altar.
```

## 18.2 MVP implementation

The MVP uses deterministic templates.

```ts
const narrativeTemplates = {
  ENTITY_TAKEN: ({ actorName, entityName }) =>
    `${actorName} takes ${entityName}.`,

  ENTITY_ACTIVATED: ({ actorName, entityName }) =>
    `${actorName} lights ${entityName}.`,
};
```

## 18.3 AI narration

AI-generated narration is outside the P0 path.

A future narrator may rewrite deterministic event text, but the original domain event and canonical text must remain preserved.

---

# 19. MVP World Content

## 19.1 Room One: Forest Path

Purpose:

* initial spawn room
* teaches movement
* introduces weather and atmosphere

Entities:

* eastern shrine exit
* western clearing exit
* decorative fallen sign

## 19.2 Room Two: Ruined Shrine

Purpose:

* shared-object race
* persistent visual mutation
* primary MVP demonstration

Entities:

* portable lantern
* shrine brazier
* broken altar
* exits to forest path and clearing

## 19.3 Room Three: Moonlit Clearing

Purpose:

* verifies movement synchronization
* provides a separate shared room
* confirms room-specific subscriptions

Entities:

* stone well
* return path
* decorative moth swarm

---

# 20. User Interface Requirements

## 20.1 Desktop layout

```text
┌─────────────────────────────────────────────┐
│ Illustrated Room                           │
│                                             │
├───────────────────────┬─────────────────────┤
│ Narrative Feed        │ Inventory           │
│                       │ Visible Players      │
├───────────────────────┴─────────────────────┤
│ Command Input                               │
└─────────────────────────────────────────────┘
```

## 20.2 Mobile layout

```text
Illustrated Room
Room Description
Narrative Feed
Inventory Drawer
Command Input
```

## 20.3 Required states

* connecting
* connected
* reconnecting
* synchronized
* resynchronizing
* command pending
* command refused
* asset unavailable

---

# 21. Security Requirements

## P0 security

* validate all incoming messages
* reject unknown message types
* enforce command length limits
* rate-limit command submission
* sanitize chat output
* never trust client player IDs without session validation
* never accept client-authored revisions as truth
* prevent arbitrary file paths in asset requests
* use parameterized database queries
* log rejected protocol violations

Authentication may use temporary MVP identities, but the server must assign and validate the authoritative player identity.

---

# 22. Observability

## Required logs

* connection opened
* connection closed
* command received
* command accepted
* command refused
* transaction failed
* revision conflict
* resynchronization requested
* snapshot loaded
* event replay completed
* scene manifest generated

## Required diagnostic fields

```text
requestId
commandId
playerId
worldId
roomId
roomRevision
eventSequence
rulesetVersion
```

No diagnostic path should depend solely on unstructured log sentences.

---

# 23. QA Checklist

## World kernel

* [ ] Same state and command produce identical events
* [ ] Invalid actions cannot mutate state
* [ ] Missing targets return explicit refusals
* [ ] Ambiguous targets return alternatives
* [ ] Old revisions produce revision conflicts
* [ ] AI services are absent from command resolution

## Multiplayer

* [ ] Two players can occupy the same room
* [ ] Both players receive entry and exit events
* [ ] Only one player can take the lantern
* [ ] Room commands resolve sequentially
* [ ] Room-specific events are not broadcast globally

## Persistence

* [ ] Accepted commands commit atomically
* [ ] Failed transactions produce no broadcasts
* [ ] Restart restores room state
* [ ] Restart restores object ownership
* [ ] Restart restores brazier state
* [ ] Event sequence remains monotonic

## Scene compiler

* [ ] Same room state produces the same manifest
* [ ] Lantern disappears after being taken
* [ ] Lantern appears after being dropped
* [ ] Lit brazier changes required layers
* [ ] Missing artwork triggers a playable fallback
* [ ] Decorative artwork cannot create entities

## Realtime synchronization

* [ ] New clients receive a complete snapshot
* [ ] Sequence gaps trigger resynchronization
* [ ] Reconnecting players receive current state
* [ ] Duplicate messages do not duplicate mutations
* [ ] Client refresh does not reset world state

## User interface

* [ ] Commands work with keyboard input
* [ ] Command errors are understandable
* [ ] Inventory updates after object transfer
* [ ] Mobile layout remains usable
* [ ] Text interface remains playable without canvas
* [ ] Connection state is visible

---

# 24. Acceptance Criteria

The MVP is complete only when all conditions below are satisfied.

## Functional acceptance

1. Two independent browser clients connect to the same world.
2. Both enter the ruined shrine.
3. Both see each other.
4. Both attempt to take the lantern.
5. Exactly one succeeds.
6. Both clients display the correct lantern owner.
7. The successful player lights the brazier.
8. Both clients receive updated narrative text.
9. Both clients receive the updated scene manifest.
10. The lit brazier appears visually.
11. The server is restarted.
12. A client reconnects.
13. The lantern owner remains correct.
14. The brazier remains lit.
15. The scene manifest matches the restored state.

## Engineering acceptance

* all kernel tests pass
* all integration tests pass
* no direct client state mutation path exists
* no AI service is required for world simulation
* scene manifests are deterministic
* domain events are replayable
* persistence survives forced restart
* the full demonstration can be performed without manual database editing

---

# 25. Implementation Milestones

## Milestone 1: Domain kernel

Deliverables:

* world, room, player, and entity schemas
* command contracts
* domain event contracts
* deterministic command resolver
* kernel unit tests

Exit criterion:

The lantern race can be simulated entirely in memory.

## Milestone 2: Persistence

Deliverables:

* SQLite schema
* transaction boundary
* event ledger
* materialized state
* restart restoration
* persistence integration tests

Exit criterion:

The lantern owner and brazier state survive restart.

## Milestone 3: Realtime multiplayer

Deliverables:

* WebSocket protocol
* connection registry
* room subscriptions
* serialized room actor
* snapshots and incremental events

Exit criterion:

Two browser clients receive synchronized state.

## Milestone 4: Scene compiler

Deliverables:

* scene-manifest schema
* room-to-scene projection
* deterministic contract hashing
* lantern and brazier visual rules

Exit criterion:

World-state mutations produce correct scene manifests.

## Milestone 5: Illustrated client

Deliverables:

* PixiJS room renderer
* DOM narrative interface
* command input
* inventory
* visible player list
* fallback text mode

Exit criterion:

The complete MVP scenario is playable through the browser.

## Milestone 6: Hardening

Deliverables:

* race-condition tests
* forced-restart tests
* duplicate-message handling
* resynchronization tests
* mobile review
* protocol validation
* logging

Exit criterion:

Every acceptance criterion passes without manual repair.

---

# 26. Next Risks

## 26.1 Command-language expansion

Risk:

Natural-language support may become a separate research project.

Mitigation:

Begin with a closed action vocabulary and deterministic synonym mappings. Add deeper Semantic Ballistics only after the basic command pipeline is stable.

## 26.2 Visual continuity

Risk:

Generated assets may conflict in style, perspective, or entity appearance.

Mitigation:

Use fixed MVP assets and layered composition. Introduce generated assets only through versioned visual contracts after the renderer works.

## 26.3 Event-schema evolution

Risk:

Future rules may interpret old events differently.

Mitigation:

Store `rulesetVersion` on every event and preserve explicit event migration boundaries.

## 26.4 SQLite write contention

Risk:

A future larger world may exceed a single database writer’s practical limits.

Mitigation:

Keep persistence behind an adapter and partitionable by world ID. Do not allow kernel code to depend on SQLite behavior.

## 26.5 Client projection drift

Risk:

A client may display a state that no longer matches the server.

Mitigation:

Include revisions and sequence numbers on all state-bearing messages. Replace local state with a server snapshot after any detected gap.

## 26.6 Scope inflation

Risk:

Combat, procedural generation, AI narration, and advanced art generation may arrive before the causal loop is reliable.

Mitigation:

The MVP remains locked to:

```text
Three rooms
Two players
One shared object
One persistent visual mutation
```

Any feature not required to prove that loop belongs after MVP acceptance.

---

# 27. Final Product Law

The MVP must preserve the following chain without shortcuts:

```text
The player proposes.
The command system interprets.
The world kernel judges.
The event ledger remembers.
The narrative projector describes.
The scene compiler illustrates.
The client displays.
```

No layer may silently inherit the authority of the layer before it.

That separation is the foundation that allows the Picture-Book MUD to later expand into combat, crafting, procedural worlds, expressive language, persistent history, and AI-assisted illustration without turning the simulation into an unreliable hallucination engine.
