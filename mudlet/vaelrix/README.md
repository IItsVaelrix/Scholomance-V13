# Vaelrix — Mudlet Client Framework

Professional, GMCP-first Mudlet scripting package for text MUDs.

This is a clean, modular, well-documented starter designed for modern MUDs that speak **GMCP** (Generic MUD Communication Protocol). It works great as a base for IRE games (Achaea family), custom MUDs, or any server that emits GMCP.

## Features (included)

- Robust GMCP handler + module negotiation
- Live vitals tracking (hp, mana, etc.) with nice colored output
- Room / area tracking
- Simple but extensible balance/eq tracking
- Affliction table (ready to expand)
- Beautiful Geyser-based vitals gauges (health + mana bars)
- A few high-quality example aliases
- Example triggers (death, prompt, etc.)
- System message console (separate mini window)
- State exposed under the global `vaelrix` table
- Debug tools
- Themed output messages (Scholomance / ritual flavor, easy to retheme)

## Installation (easiest)

### Option A — Paste & Play (Recommended to start)

1. Open Mudlet.
2. Go to the **Scripts** tab (bottom left).
3. Click the **+** to create a new script.
4. Name it `Vaelrix`.
5. Paste the entire contents of `vaelrix.lua` into the code box.
6. Make sure **GMCP** is enabled for your profile:
   - Profile → Special Options → Enable GMCP
7. Save. Connect (or reconnect) to your MUD.

The script will automatically initialize when the GMCP handshake happens.

### Option B — Full Package / .mpackage

1. Copy the `vaelrix/` folder into your Mudlet packages directory or use the .mpackage.
2. In Mudlet: `Package Manager` → `Install` → select `vaelrix.mpackage`
3. Enable GMCP on the profile.
4. Reconnect.

## Usage

### Key Globals

After connecting you have:

```lua
vaelrix.vitals          -- current vitals
vaelrix.room            -- current room info
vaelrix.affs            -- table of afflictions
vaelrix.balances        -- balance flags

vaelrix.showVitals()    -- echo current status nicely
vaelrix.debug()         -- dump state
```

### Example Aliases

- `vv` or `vitals` — show current vitals
- `qr <command>` — add to the (example) command queue
- `qc` — clear queue
- `qs` — show queue

### Extending

All the interesting code lives in clear sections at the top of `vaelrix.lua` (or the separate module files if you use the expanded layout).

Common extension points:

- `vaelrix.onVitalsUpdate()` — hook for curing decisions
- `vaelrix.onRoomUpdate()` — auto-walk, look for mobs, etc.
- Add more GMCP handlers in the `gmcp` event section
- Expand the affliction tracking when your MUD sends custom GMCP

## Theming

The output uses ritual/Scholomance-flavored language ("The Weave registers...", "Glyphs stabilize...").

To retheme for a different MUD, search for the strings containing "Weave", "Glyph", "Vaelrix", "Scholomance" and replace them.

## Creating the real .mpackage yourself (advanced)

If you want a proper single-file package from these sources:

1. Inside Mudlet, create all the scripts/aliases/triggers from this code.
2. Right-click the top "Vaelrix" folder → "Export Package..."
3. Save as `vaelrix.mpackage`

Or let the build process in this repo create one (see below).

## Building the .mpackage from source (repo)

From the repo root:

```bash
cd mudlet/vaelrix
# (optional) run a packager if we add one
zip -r ../vaelrix.mpackage .
```

Then install the resulting `vaelrix.mpackage`.

## Roadmap / Ideas you can add

- Full curing system
- Offense queue + balancing
- Highlighting for important mobs / players
- Custom chat tabs (tells, clan, etc.)
- Full GMCP Char.Items support + inventory tracking
- Speedwalking + pathing
- Custom keybindings for combat

## Support

This package was generated inside the Scholomance project.

Feel free to adapt it heavily. All code is MIT-style — do what you want.

---

**Start by pasting `vaelrix.lua`.** It is self-contained and very effective immediately.
