--[[
  Erion ArcForge HUD
  erhud_gmcp.lua

  Structured data when available (luxury path).
]]

erhud = erhud or {}

function erhud.gmcp.onGMCP()
  local event = gmcp and gmcp.Event or ""

  if event:match("Char.Vitals") or (gmcp and gmcp.Char and gmcp.Char.Vitals) then
    local v = gmcp.Char.Vitals
    if v then
      erhud.updatePlayer("hp", v.hp or v.health)
      erhud.updatePlayer("maxHp", v.maxhp or v.max_health)
      erhud.updatePlayer("mana", v.mana or v.mp)
      erhud.updatePlayer("maxMana", v.maxmana or v.max_mp)
    end
  end

  if event:match("Room.Info") or (gmcp and gmcp.Room and gmcp.Room.Info) then
    erhud.room.updateFromGMCP(gmcp.Room.Info)
  end

  if gmcp and gmcp.Char and gmcp.Char.Status then
    local s = gmcp.Char.Status
    if s.name then erhud.updatePlayer("name", s.name) end
    if s.level then erhud.updatePlayer("level", s.level) end
  end
end

function erhud.gmcp.setup()
  if registerAnonymousEventHandler then
    registerAnonymousEventHandler("gmcp", "erhud.gmcp.onGMCP")
  end
end
