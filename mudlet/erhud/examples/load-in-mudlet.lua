--[[
  Quick loader you can paste directly into a Mudlet script.

  1. Put all the `scripts/*.lua` files into your profile folder under a subfolder called `erhud/scripts/`
  2. Paste ONLY this file content into a new Mudlet script.
  3. Save & it will call erhud.boot()
]]

-- Adjust this path if needed
local base = getMudletHomeDir() .. "/erhud/scripts/"

local files = {
  "erhud_state.lua",
  "erhud_config.lua",
  "erhud_data_router.lua",
  "erhud_theme.lua",
  "erhud_layout.lua",
  "erhud_render.lua",
  "erhud_gmcp.lua",
  "erhud_msdp.lua",
  "erhud_prompt_parser.lua",
  "erhud_room.lua",
  "erhud_combat.lua",
  "erhud_chat.lua",
  "erhud_quests.lua",
  "erhud_party.lua",
  "erhud_commands.lua",
  "erhud_debug.lua",
  "erhud_aliases.lua",
  "erhud_boot.lua",
}

for _, f in ipairs(files) do
  local ok, err = pcall(dofile, base .. f)
  if not ok then
    cecho(string.format("<red>Failed to load %s: %s</red>\n", f, err))
  end
end

erhud.aliases.setup()
erhud.boot()
