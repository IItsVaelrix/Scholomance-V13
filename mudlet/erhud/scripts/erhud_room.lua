--[[
  Erion ArcForge HUD
  erhud_room.lua
]]

erhud = erhud or {}

function erhud.room.parseExits(exitString)
  if not exitString then return end
  local dirs = {"n","e","s","w","u","d"}

  for _, key in ipairs(dirs) do
    local hasLower = exitString:find(key, 1, true) ~= nil
    local hasUpper = exitString:find(key:upper(), 1, true) ~= nil

    erhud.state.room.exits[key] = hasLower or hasUpper
    erhud.state.room.unexplored[key] = hasUpper and not hasLower
  end

  erhud.markDirty("room")
end

function erhud.room.clickExit(dir)
  if not dir then return end
  local full = {
    n = "north", e = "east", s = "south", w = "west",
    u = "up", d = "down"
  }
  local cmd = full[dir] or dir
  send(cmd)
end

function erhud.room.updateFromGMCP(data)
  if not data then return end
  if data.name then erhud.updateRoom("name", data.name) end
  if data.area then erhud.updateRoom("area", data.area) end
  if data.exits then
    -- normalize GMCP exits if present
    for k, v in pairs(data.exits) do
      local short = k:sub(1,1):lower()
      erhud.state.room.exits[short] = true
    end
    erhud.markDirty("room")
  end
end
