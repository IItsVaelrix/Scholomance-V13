--[[
  Erion ArcForge HUD
  erhud_commands.lua
]]

erhud = erhud or {}

function erhud.commands.addButton(text, cmd, dangerous)
  if not erhud.ui.containers.commandDock then return end

  local btn = Geyser.Label:new({
    name = "erhud_btn_" .. text:gsub("%s", "_"),
    message = text,
    fontSize = 9,
    fgColor = erhud.theme.get("text_main"),
    bgColor = erhud.theme.get("bg_raised"),
  }, erhud.ui.containers.commandDock)

  local safeCmd = function()
    if dangerous and erhud.config.safety and (erhud.config.safety.confirmFlee or erhud.config.safety.confirmRecall) then
      if not confirm("Really " .. text .. "?") then return end
    end
    send(cmd)
  end

  btn:setClickCallback(safeCmd)
  return btn
end

function erhud.commands.setupDock()
  local cmds = erhud.config.commands or {}
  local buttons = {
    { "Score", cmds.score or "score", false },
    { "Inv", cmds.inventory or "inventory", false },
    { "Eq", cmds.equipment or "equipment", false },
    { "Quests", cmds.quest or "quest", false },
    { "Map", cmds.map or "map", false },
    { "Rest", cmds.rest or "rest", false },
    { "Stand", cmds.stand or "stand", false },
    { "Flee", cmds.flee or "flee", true },
  }

  for _, b in ipairs(buttons) do
    erhud.commands.addButton(b[1], b[2], b[3])
  end
end
