--[[
  Erion ArcForge HUD
  erhud_render.lua

  All rendering functions read from erhud.state and update Geyser widgets.
  Uses dirty flags from the router.
]]

erhud = erhud or {}

function erhud.render.all()
  erhud.render.vitals()
  erhud.render.economy()
  erhud.render.combat()
  erhud.render.room()
  erhud.render.party()
  erhud.render.quests()
  erhud.render.topBar()
end

function erhud.render.tick()
  local dirty = erhud.state.ui.dirty or {}
  if dirty.player or dirty.vitals then erhud.render.vitals() end
  if dirty.economy then erhud.render.economy() end
  if dirty.combat then erhud.render.combat() end
  if dirty.room then erhud.render.room() end
  if dirty.party then erhud.render.party() end
  if dirty.quests then erhud.render.quests() end
  if dirty.chat then erhud.render.chat() end
  erhud.state.ui.dirty = {}
end

local function setGauge(gauge, current, max, goodColor, warnColor, badColor)
  if not gauge then return end
  current = math.max(0, current or 0)
  max = math.max(1, max or 1)

  gauge:setValue(current, max)

  local pct = (current / max) * 100
  if pct < 20 then
    gauge:setColor(badColor or erhud.theme.get("hp_bad"))
  elseif pct < 35 then
    gauge:setColor(warnColor or erhud.theme.get("hp_warn"))
  else
    gauge:setColor(goodColor or erhud.theme.get("hp_good"))
  end

  gauge:setText(string.format("%d/%d", current, max))
end

function erhud.render.vitals()
  local p = erhud.state.player
  local cfg = erhud.config.warnings or {}

  setGauge(erhud.ui.widgets.hpGauge, p.hp, p.maxHp, nil, nil, nil)
  setGauge(erhud.ui.widgets.manaGauge, p.mana, p.maxMana, erhud.theme.get("mana"), erhud.theme.get("mana"), erhud.theme.get("mana"))
  setGauge(erhud.ui.widgets.xpGauge, p.xpPercent or 0, 100, erhud.theme.get("xp"), erhud.theme.get("xp"), erhud.theme.get("xp"))

  -- Flash states (simple)
  if p.hp > 0 and p.hp < cfg.hpCritical then
    -- Could add pulse animation here in future
  end
end

function erhud.render.economy()
  local e = erhud.state.economy
  local txt = string.format(
    "G: <gold>%s</gold>  QP: <cyan>%s</cyan>  FP: <magenta>%s</magenta>\nMP: <yellow>%s</yellow>  House: %s",
    e.gold, e.questpoints, e.faith, e.mudpies, e.house
  )

  if erhud.ui.widgets.economyLabel then
    erhud.ui.widgets.economyLabel:echo(txt)
  end
end

function erhud.render.combat()
  local c = erhud.state.combat
  local w = erhud.ui.widgets

  if w.targetLabel then
    local name = c.targetName or "No target"
    w.targetLabel:echo(string.format("<b>%s</b>", name))
  end

  if w.targetGauge and c.targetHpPercent then
    w.targetGauge:setValue(c.targetHpPercent, 100)
    if c.targetHpPercent < 25 then
      w.targetGauge:setColor(erhud.theme.get("hp_bad"))
    else
      w.targetGauge:setColor(erhud.theme.get("hp_warn"))
    end
  end

  if w.targetFlags then
    local flags = {}
    if c.targetFlags.blinded then table.insert(flags, "BLIND") end
    if c.targetFlags.dazed then table.insert(flags, "DAZED") end
    if c.targetFlags.stunned then table.insert(flags, "STUN") end

    local str = #flags > 0 and table.concat(flags, " ") or ""
    w.targetFlags:echo(str)
  end
end

function erhud.render.room()
  local r = erhud.state.room
  local w = erhud.ui.widgets

  if w.roomName then
    w.roomName:echo(r.name or "Unknown location")
  end
  if erhud.ui.widgets.areaLabel then
    erhud.ui.widgets.areaLabel:echo(r.area or "")
  end

  -- Compass buttons (basic labels for now)
  erhud.render.compass()
end

function erhud.render.compass()
  local r = erhud.state.room
  local dirs = {"n","e","s","w","u","d"}
  local labels = erhud.ui.compassLabels or {}

  -- Rebuild if needed
  if not erhud.ui.containers.compass then return end

  -- Simple approach: create labels if not present
  if not next(labels) then
    local dirMap = {
      u = {0,0}, n = {1,0}, d = {2,0},
      w = {0,1}, [""] = {1,1}, e = {2,1},
      [""] = {0,2}, s = {1,2}, [""] = {2,2}
    }

    for _, d in ipairs(dirs) do
      local l = Geyser.Label:new({
        name = "erhud_compass_" .. d,
        message = d:upper(),
        fontSize = 11,
        alignment = "center",
      }, erhud.ui.containers.compass)

      l:setClickCallback("erhud.room.clickExit", d)
      labels[d] = l
    end
    erhud.ui.compassLabels = labels
  end

  for d, label in pairs(labels) do
    local available = r.exits[d]
    local unexplored = r.unexplored[d]

    if available then
      label:setFgColor(unexplored and erhud.theme.get("void") or erhud.theme.get("text_main"))
      label:setStyleSheet("background-color: " .. erhud.theme.get("bg_raised") .. ";")
    else
      label:setFgColor(erhud.theme.get("text_muted"))
      label:setStyleSheet("background-color: " .. erhud.theme.get("bg_deep") .. ";")
    end
  end
end

function erhud.render.party()
  local p = erhud.state.party
  if not erhud.ui.widgets.partyBox then return end

  local lines = {}
  for _, m in ipairs(p.members or {}) do
    table.insert(lines, string.format("%s: %d%%", m.name or "?", m.hpPercent or 0))
  end
  erhud.ui.widgets.partyBox:echo(table.concat(lines, "\n"))
end

function erhud.render.quests()
  -- Populated mostly by chat/quest console
end

function erhud.render.topBar()
  local p = erhud.state.player
  local r = erhud.state.room
  local txt = string.format(
    "%s | Lv %s | %s | %s | <gold>%s</gold>",
    p.name or "You",
    p.level or "?",
    p.mainClass or "",
    r.area or "",
    erhud.state.economy.gold or 0
  )
  if erhud.ui.widgets.topInfo then
    erhud.ui.widgets.topInfo:echo(txt)
  end
end

function erhud.render.chat()
  -- Handled via append to miniconsole in chat module
end
