--[[
  Erion ArcForge HUD
  erhud_party.lua
]]

erhud = erhud or {}

function erhud.party.parseGroupLine(line)
  -- Erion %D often produces lines like:
  -- Name1 87%   Name2 34%
  -- We do a simple parse.
  erhud.state.party.members = {}

  for name, pct in line:gmatch("(%a+)%s+(%d+)%%") do
    table.insert(erhud.state.party.members, {
      name = name,
      hpPercent = tonumber(pct)
    })
  end

  erhud.markDirty("party")
end

function erhud.party.setupTriggers()
  -- This is fragile. Prefer GMCP when available.
  tempRegexTrigger([[(\w+)\s+(\d+)%]], function()
    -- Only act on likely group lines (very rough)
    if line:match("%d+%%") and not line:match("hp") then
      erhud.party.parseGroupLine(line)
    end
  end)
end
