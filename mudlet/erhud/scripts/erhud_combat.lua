--[[
  Erion ArcForge HUD
  erhud_combat.lua
]]

erhud = erhud or {}

function erhud.combat.setTarget(name, hpPercent)
  erhud.update({"combat", "targetName"}, name)
  erhud.update({"combat", "targetHpPercent"}, hpPercent)
  erhud.update({"combat", "active"}, true)
  erhud.markDirty("combat")
end

function erhud.combat.clearTarget()
  erhud.update({"combat", "active"}, false)
  erhud.update({"combat", "targetName"}, nil)
  erhud.update({"combat", "targetHpPercent"}, nil)
  erhud.update({"combat", "targetFlags"}, {blinded=false, dazed=false, stunned=false})
  erhud.markDirty("combat")
end

function erhud.combat.addToLog(line, isIncoming)
  local key = isIncoming and "lastIncoming" or "lastOutgoing"
  erhud.update({"combat", key}, line)

  if erhud.ui.consoles and erhud.ui.consoles.combat then
    local color = isIncoming and "red" or "green"
    cecho("erhud_combatlog", string.format("<%s>%s<reset>\n", color, line))
  end
end

-- Click helpers (safe)
function erhud.combat.killTarget()
  local t = erhud.state.combat.targetName
  if t then send("kill " .. t) end
end

function erhud.combat.considerTarget()
  local t = erhud.state.combat.targetName
  if t then send("consider " .. t) end
end

function erhud.combat.flee()
  if erhud.config.safety.confirmFlee then
    if not confirm("Really flee?") then return end
  end
  send(erhud.config.commands.flee or "flee")
end
