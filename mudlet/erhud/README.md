# Erion ArcForge HUD

A beautiful, readable, low-friction Geyser-based HUD for **Erion MUD**.

**Theme:** Arcane Glass Terminal — dark fantasy control panel.

## Installation

### Option 1: Script Loader (Recommended for testing)

1. Copy the entire `erhud/` folder into your Mudlet profile directory:
   - Usually `~/.config/mudlet/profiles/YOUR_PROFILE/`
2. In Mudlet, create a **new Script** called `ErHUD Loader`.
3. Paste the contents of `scripts/erhud_init.lua`.
4. Save.
5. Run in command line: `erhud`

### Option 2: Full Package

- Create a package in Mudlet and import all scripts + triggers.
- Or use the `build-mpackage.sh` (see below).

### Recommended Erion Prompt (Critical)

In Erion, set your prompt to this (or close):

```
<%h/%H hp | %m/%M mn | T:%p | XP:%x/%X | G:%g | QP:%C | FP:%y | HPts:%u | MP:%N | A:%a | R:%r | E:%e>
```

Run `erhud prompt` inside Mudlet to print it.

## Commands

- `erhud` — help
- `erhud on` / `erhud off`
- `erhud compact` / `erhud full`
- `erhud theme arcane_glass`
- `erhud debug`
- `erhud prompt`
- `erhud reset`

## Core Panels

- **Left Rail**: HP, Mana, XP gauges + Economy + Command buttons
- **Right Rail**: Target + Flags + Room name + Compass (clickable) + Party
- **Bottom**: Tabbed consoles (Chat, Combat Log, Quests, Announcements, Debug)
- **Top bar**: Quick status

## Data Sources (priority)

1. GMCP / MSDP (if Erion supports)
2. Erion prompt variables (`%h`, `%H`, `%m`, etc.)
3. Text triggers (last resort)

## Important Safety

- Flee / Recall buttons ask for confirmation.
- No auto-combat, no botting, no unattended play.
- All movement via explicit click or typed command.

## Building the .mpackage

```bash
cd mudlet/erhud
bash build-mpackage.sh
```

Then install `../erhud.mpackage` via Mudlet's package manager.

## QA Checklist (from spec)

- [ ] HUD loads without overlapping main output
- [ ] Gauges update from prompt
- [ ] Room name + exits update (uppercase = unexplored)
- [ ] Clickable compass works
- [ ] Target panel shows status flags
- [ ] Chat routes to bottom tab
- [ ] Quest lines captured
- [ ] No duplicate handlers on reconnect
- [ ] `erhud compact` / `erhud full` work
- [ ] Existing Erion UIs can coexist (namespaced under `erhud`)

## Known Risks

- Prompt format changes break parsing → use the documented prompt preset.
- Existing ErionMud-UI collision → use `erhud off` or disable the other UI.
- GMCP may be limited or absent on Erion.
- Group parsing (%D) is fragile — improve when you see live output.

## Next Steps / Customization

Look at the modules:
- `erhud_gmcp.lua` — add more GMCP modules as you discover them
- `erhud_combat.lua` — extend damage log parsing
- `erhud_quests.lua` — more event patterns
- `erhud_render.lua` — improve visual polish and flash states

This package follows the complete vision document for "Erion ArcForge HUD".

---

Built as a modular, clean, non-spaghetti Geyser HUD.
