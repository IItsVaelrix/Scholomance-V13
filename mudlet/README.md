# Mudlet Scripts

This directory contains Mudlet (Lua MUD client) packages and scripts created for the Scholomance project.

## Currently Available

- **vaelrix/** — Full-featured GMCP-first framework package (Vaelrix)
  - Professional vitals + room tracking
  - Geyser gauges
  - Clean alias + trigger examples
  - Extensible design
  - Themed with ritual/Scholomance flavor

## Quick Start

See `vaelrix/README.md` for full instructions.

The fastest way:
1. Open `vaelrix/vaelrix.lua`
2. In Mudlet → Scripts tab → new script "Vaelrix"
3. Paste the whole file
4. Enable GMCP on your profile
5. Connect

There's also a ready `vaelrix.mpackage` in the parent `mudlet/` directory.

## Why GMCP?

Most modern MUDs (especially IRE games and well-made custom servers) send rich structured data via GMCP instead of (or in addition to) plain text. This package is built around that.

## Want something more specific?

Tell me:
- The exact MUD name
- What GMCP modules it sends (or sample lines)
- The exact features you want (full curing, offense, mapper, etc.)

I can rapidly expand this into a complete system tailored to your game.

---

All code is designed to be readable, commented, and easy to fork.
