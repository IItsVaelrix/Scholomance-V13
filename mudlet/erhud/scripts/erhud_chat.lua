--[[
  Erion ArcForge HUD
  erhud_chat.lua
]]

erhud = erhud or {}

function erhud.chat.append(channel, who, msg)
  local line = string.format("[%s] %s: %s", channel, who or "", msg or "")

  table.insert(erhud.state.chat.recent, line)
  if #erhud.state.chat.recent > 50 then table.remove(erhud.state.chat.recent, 1) end

  if erhud.ui.consoles and erhud.ui.consoles.chat then
    local color = channel == "tell" and "cyan" or "white"
    cecho("erhud_chat", string.format("<%s>%s<reset>\n", color, line))
  end

  -- Flash mention
  local myName = erhud.state.player.name
  if myName and msg and msg:lower():find(myName:lower()) then
    erhud.state.chat.unread = erhud.state.chat.unread + 1
    erhud.markDirty("chat")
  end
end

function erhud.chat.setupTriggers()
  -- Say
  tempRegexTrigger([[^(\w+) says, "(.+)"$]], function()
    erhud.chat.append("say", matches[2], matches[3])
  end)

  -- Tells (very common pattern)
  tempRegexTrigger([[^(Tell|You tell) (.+), "(.+)"$]], function()
    erhud.chat.append("tell", matches[3], matches[4])
  end)

  -- Group / Clan - add more specific patterns as you observe them
  tempRegexTrigger([[^<Group> (.+)$]], function()
    erhud.chat.append("group", "Group", matches[2])
  end)
end
