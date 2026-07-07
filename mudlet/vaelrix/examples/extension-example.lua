--[[
  Vaelrix Extension Example

  Drop this logic into another Script in Mudlet, or require it after Vaelrix loads.

  This shows how to react to vitals and room changes.
]]

-- Wait until Vaelrix exists
tempTimer(1, function()
  if not vaelrix then
    print("Vaelrix not loaded yet.")
    return
  end

  -- Example: Simple low-health warning + auto sip
  vaelrix.onVitalsUpdate = function()
    local v = vaelrix.vitals
    if not v.hp or not v.maxhp then return end

    local pct = (v.hp / v.maxhp) * 100

    if pct < 35 and not vaelrix.flags.lowHealthWarned then
      vaelrix.flags.lowHealthWarned = true
      send("sip health")
      cecho("<red>⟡ The glyphs flare — health critical.<reset>\n")
    elseif pct > 70 then
      vaelrix.flags.lowHealthWarned = false
    end
  end

  -- Hook the vitals update path
  local originalHandle = handleCharVitals or function() end

  -- Alternative: just poll every few seconds
  tempTimer(3, function()
    if vaelrix.onVitalsUpdate then
      vaelrix.onVitalsUpdate()
    end
  end, true)  -- repeating timer

  cecho("<cyan>⟡ Vaelrix extension example loaded.<reset>\n")
end)
