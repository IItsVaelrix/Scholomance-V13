--[[
  Erion ArcForge HUD - Master Loader
  Load order matters.
]]

erhud = erhud or {}

-- Core
dofile(getMudletHomeDir() .. "/erhud/scripts/erhud_state.lua")
dofile(getMudletHomeDir() .. "/erhud/scripts/erhud_config.lua")
dofile(getMudletHomeDir() .. "/erhud/scripts/erhud_data_router.lua")
dofile(getMudletHomeDir() .. "/erhud/scripts/erhud_theme.lua")

-- Layout & render
dofile(getMudletHomeDir() .. "/erhud/scripts/erhud_layout.lua")
dofile(getMudletHomeDir() .. "/erhud/scripts/erhud_render.lua")

-- Data sources
dofile(getMudletHomeDir() .. "/erhud/scripts/erhud_gmcp.lua")
dofile(getMudletHomeDir() .. "/erhud/scripts/erhud_msdp.lua")
dofile(getMudletHomeDir() .. "/erhud/scripts/erhud_prompt_parser.lua")
dofile(getMudletHomeDir() .. "/erhud/scripts/erhud_room.lua")
dofile(getMudletHomeDir() .. "/erhud/scripts/erhud_combat.lua")
dofile(getMudletHomeDir() .. "/erhud/scripts/erhud_chat.lua")
dofile(getMudletHomeDir() .. "/erhud/scripts/erhud_quests.lua")
dofile(getMudletHomeDir() .. "/erhud/scripts/erhud_party.lua")
dofile(getMudletHomeDir() .. "/erhud/scripts/erhud_commands.lua")

-- UI / debug
dofile(getMudletHomeDir() .. "/erhud/scripts/erhud_debug.lua")

-- Aliases and boot
dofile(getMudletHomeDir() .. "/erhud/scripts/erhud_aliases.lua")
dofile(getMudletHomeDir() .. "/erhud/scripts/erhud_boot.lua")

-- Kick it off
erhud.aliases.setup()
erhud.boot()
