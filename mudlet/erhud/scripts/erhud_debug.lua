--[[
  Erion ArcForge HUD
  erhud_debug.lua
]]

erhud = erhud or {}

function erhud.debug.printState()
  if erhud.ui.consoles and erhud.ui.consoles.debug then
    cecho("erhud_debug", "=== ERHUD STATE DUMP ===\n")
    display(erhud.state)
  else
    display(erhud.state)
  end
end

function erhud.debug.log(msg)
  if erhud.ui.consoles and erhud.ui.consoles.debug then
    cecho("erhud_debug", "[debug] " .. tostring(msg) .. "\n")
  end
end
