--[[
  Erion ArcForge HUD
  erhud_prompt_parser.lua

  Parses Erion's custom prompt variables as stable fallback.
  Recommended prompt:
  <%h/%H hp | %m/%M mn | T:%p | XP:%x/%X | G:%g | QP:%C | FP:%y | HPts:%u | MP:%N | A:%a | R:%r | E:%e>
]]

erhud = erhud or {}

function erhud.prompt.parse(line)
  if not line then return end

  -- Vitals
  local hp, maxHp, mana, maxMana = line:match("(%d+)/(%d+) hp | (%d+)/(%d+) mn")
  if hp then
    erhud.update({"player", "hp"}, tonumber(hp))
    erhud.update({"player", "maxHp"}, tonumber(maxHp))
    erhud.update({"player", "mana"}, tonumber(mana))
    erhud.update({"player", "maxMana"}, tonumber(maxMana))
  end

  -- Target
  local targetInfo = line:match("T:([^|]+)")
  if targetInfo then
    local tName, tPct = targetInfo:match("(.+)%s*%((%d+)%%%)")
    if tName then
      erhud.update({"combat", "targetName"}, tName:match("^%s*(.-)%s*$"))
      erhud.update({"combat", "targetHpPercent"}, tonumber(tPct))
      erhud.update({"combat", "active"}, true)
    end

    -- Status flags from target info if present (Erion shows B/D/S markers)
    if targetInfo:find("B") then erhud.setTargetFlag("blinded", true) end
    if targetInfo:find("D") then erhud.setTargetFlag("dazed", true) end
    if targetInfo:find("S") then erhud.setTargetFlag("stunned", true) end
  end

  -- XP
  local xpCur, xpMax = line:match("XP:(%d+)/(%d+)")
  if xpCur then
    erhud.update({"player", "xp"}, tonumber(xpCur))
    erhud.update({"player", "xpToLevel"}, tonumber(xpMax))
    local pct = math.floor((tonumber(xpCur) / math.max(1, tonumber(xpMax))) * 100)
    erhud.update({"player", "xpPercent"}, pct)
  end

  -- Economy
  local gold = line:match("G:(%d+)")
  if gold then erhud.updateEconomy("gold", tonumber(gold)) end

  local qp = line:match("QP:(%d+)")
  if qp then erhud.updateEconomy("questpoints", tonumber(qp)) end

  local fp = line:match("FP:(%d+)")
  if fp then erhud.updateEconomy("faith", tonumber(fp)) end

  local house = line:match("HPts:(%d+)")
  if house then erhud.updateEconomy("house", tonumber(house)) end

  local mudpies = line:match("MP:(%d+)")
  if mudpies then erhud.updateEconomy("mudpies", tonumber(mudpies)) end

  -- Alignment
  local align = line:match("A:([^|]+)")
  if align then erhud.updatePlayer("alignment", align:match("^%s*(.-)%s*$")) end

  -- Room name
  local room = line:match("R:([^|]+)")
  if room then
    erhud.updateRoom("name", room:match("^%s*(.-)%s*$"))
  end

  -- Exits
  local exits = line:match("E:([^>]+)")
  if exits then
    erhud.room.parseExits(exits)
  end
end

-- Setup the actual prompt trigger
function erhud.prompt.setupCapture()
  -- Match a very broad prompt. User should configure Erion to use the recommended format.
  tempTrigger("^<[^>]+>", function()
    erhud.prompt.parse(line)
  end)

  -- Also try to catch common Erion prompt patterns without < > wrapper
  tempRegexTrigger([[\d+\/\d+ hp \| \d+\/\d+ mn]], function()
    erhud.prompt.parse(line)
  end)
end
