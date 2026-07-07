--[[
  Erion ArcForge HUD
  erhud_quests.lua
]]

erhud = erhud or {}

function erhud.quests.addQuest(text)
  table.insert(erhud.state.quests.recent, {text = text, time = os.date("%H:%M")})
  if #erhud.state.quests.recent > 30 then table.remove(erhud.state.quests.recent, 1) end

  if erhud.ui.consoles and erhud.ui.consoles.quests then
    cecho("erhud_quests", string.format("<cyan>[QUEST]</cyan> %s\n", text))
  end

  erhud.markDirty("quests")
end

function erhud.quests.setupTriggers()
  tempTrigger("You are now on quest", function()
    erhud.quests.addQuest(line)
  end)

  tempRegexTrigger([[You have completed the quest "(.+)"%.]], function()
    erhud.quests.addQuest("COMPLETED: " .. matches[2])
  end)

  -- Announcements / global events
  tempRegexTrigger([[^\*\* (.+) \*\*$]], function()
    if erhud.ui.consoles and erhud.ui.consoles.announce then
      cecho("erhud_announce", string.format("<yellow>** %s **<reset>\n", matches[2]))
    end
  end)
end
