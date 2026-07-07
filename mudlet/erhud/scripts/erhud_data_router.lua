--[[
  Erion ArcForge HUD
  erhud_data_router.lua

  Single source of truth updates.
  Triggers and protocol code call erhud.update(path, value)
  Never mutate widgets directly from data sources.
]]

erhud = erhud or {}

function erhud.update(path, value)
  if type(path) ~= "table" then return end

  local node = erhud.state
  for i = 1, #path - 1 do
    if type(node) ~= "table" then return end
    node = node[path[i]]
    if not node then return end
  end

  local key = path[#path]
  if node[key] == value then return end   -- no-op on no change

  node[key] = value
  erhud.markDirty(path[1])
end

function erhud.markDirty(panel)
  if not erhud.state.ui.dirty then erhud.state.ui.dirty = {} end
  erhud.state.ui.dirty[panel] = true
end

-- Convenience helpers
function erhud.updatePlayer(field, value)
  erhud.update({"player", field}, value)
end

function erhud.updateEconomy(field, value)
  erhud.update({"economy", field}, value)
end

function erhud.updateCombat(field, value)
  erhud.update({"combat", field}, value)
end

function erhud.updateRoom(field, value)
  erhud.update({"room", field}, value)
end

function erhud.setTargetFlag(flag, bool)
  erhud.state.combat.targetFlags[flag] = bool
  erhud.markDirty("combat")
end
