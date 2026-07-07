--[[
  Erion ArcForge HUD
  erhud_layout.lua

  Creates the full Geyser layout:
  - Top bar
  - Left rail (Vitals, XP, Economy, Command Dock)
  - Center: main output (we do not touch)
  - Right rail (Combat, Room/Compass, Party, Minimap)
  - Bottom tabbed consoles
]]

erhud = erhud or {}
erhud.ui = erhud.ui or {}
erhud.ui.containers = erhud.ui.containers or {}
erhud.ui.widgets = erhud.ui.widgets or {}

local G = Geyser   -- shorthand

function erhud.layout.create()
  if not G then
    cecho("<red>[ErHUD]</red> Geyser not available! HUD disabled.\n")
    return false
  end

  local cfg = erhud.config.layout or {}
  local leftW  = cfg.leftWidth or "18%"
  local rightW = cfg.rightWidth or "20%"

  -- Main container that sits around the output
  erhud.ui.containers.main = G.Container:new({
    name = "erhud_main",
    x = 0, y = 0,
    width = "100%", height = "100%",
  })

  -- === TOP BAR ===
  erhud.ui.containers.topBar = G.HBox:new({
    name = "erhud_topbar",
    x = 0, y = 0,
    width = "100%", height = "26px",
    parent = erhud.ui.containers.main
  })

  erhud.ui.widgets.topInfo = G.Label:new({
    name = "erhud_topinfo",
    fontSize = 10,
    fgColor = erhud.theme.get("text_main"),
    bgColor = erhud.theme.get("bg_panel"),
    message = "Erion ArcForge HUD",
  }, erhud.ui.containers.topBar)

  -- === LEFT RAIL ===
  erhud.ui.containers.leftRail = G.VBox:new({
    name = "erhud_leftrail",
    x = 0, y = "26px",
    width = leftW, height = "-186px",
    parent = erhud.ui.containers.main
  })

  -- Vitals gauges
  erhud.ui.widgets.hpGauge = G.Gauge:new({name="erhud_hp", height="22px"}, erhud.ui.containers.leftRail)
  erhud.ui.widgets.manaGauge = G.Gauge:new({name="erhud_mana", height="22px"}, erhud.ui.containers.leftRail)
  erhud.ui.widgets.xpGauge = G.Gauge:new({name="erhud_xp", height="18px"}, erhud.ui.containers.leftRail)

  -- Economy strip
  erhud.ui.widgets.economyLabel = G.Label:new({
    name = "erhud_economy",
    height = "38px",
    fgColor = erhud.theme.get("gold"),
    bgColor = erhud.theme.get("bg_raised"),
    fontSize = 9,
  }, erhud.ui.containers.leftRail)

  -- Command dock (horizontal-ish grid via labels)
  erhud.ui.containers.commandDock = G.Grid:new({
    name = "erhud_commands",
    height = "92px",
    columns = 4,
  }, erhud.ui.containers.leftRail)

  -- === RIGHT RAIL ===
  erhud.ui.containers.rightRail = G.VBox:new({
    name = "erhud_rightrail",
    x = "-" .. rightW, y = "26px",
    width = rightW, height = "-186px",
    parent = erhud.ui.containers.main
  })

  -- Combat target
  erhud.ui.widgets.targetLabel = G.Label:new({
    name = "erhud_target_name",
    height = "20px",
    fgColor = erhud.theme.get("text_main"),
    bgColor = erhud.theme.get("bg_panel"),
  }, erhud.ui.containers.rightRail)

  erhud.ui.widgets.targetGauge = G.Gauge:new({name="erhud_target_hp", height="20px"}, erhud.ui.containers.rightRail)

  erhud.ui.widgets.targetFlags = G.Label:new({
    name = "erhud_target_flags",
    height = "16px", fontSize = 9,
    bgColor = erhud.theme.get("bg_raised"),
  }, erhud.ui.containers.rightRail)

  -- Room / Compass
  erhud.ui.widgets.roomName = G.Label:new({
    name = "erhud_room",
    height = "18px",
    fgColor = erhud.theme.get("text_main"),
    bgColor = erhud.theme.get("bg_raised"),
  }, erhud.ui.containers.rightRail)

  erhud.ui.containers.compass = G.Grid:new({
    name = "erhud_compass",
    height = "78px",
    columns = 3,
  }, erhud.ui.containers.rightRail)

  erhud.ui.widgets.areaLabel = G.Label:new({name="erhud_area", height="16px", fontSize=8}, erhud.ui.containers.rightRail)

  -- Party
  erhud.ui.widgets.partyBox = G.Label:new({
    name = "erhud_party",
    height = "52px",
    fontSize = 8,
    bgColor = erhud.theme.get("bg_panel"),
  }, erhud.ui.containers.rightRail)

  -- === BOTTOM TABBED AREA ===
  erhud.ui.containers.bottom = G.Container:new({
    name = "erhud_bottom",
    x = 0, y = "-160px",
    width = "100%", height = "160px",
    parent = erhud.ui.containers.main
  })

  -- Simple tab labels + consoles (we will use multiple miniconsoles)
  erhud.ui.widgets.bottomTabs = G.HBox:new({
    name = "erhud_tabs",
    height = "20px",
    parent = erhud.ui.containers.bottom
  })

  local tabs = {"Chat", "CombatLog", "Quests", "Announcements", "Debug"}
  for _, tabName in ipairs(tabs) do
    local label = G.Label:new({
      name = "erhud_tab_" .. tabName,
      message = tabName,
      fontSize = 9,
      fgColor = erhud.theme.get("text_muted"),
      bgColor = erhud.theme.get("bg_raised"),
    }, erhud.ui.widgets.bottomTabs)

    label:setClickCallback("erhud.ui.switchTab", tabName)
  end

  -- Miniconsoles for logs
  erhud.ui.consoles = {}
  erhud.ui.consoles.chat = G.MiniConsole:new({name="erhud_chat", height="140px", wrapAt=80}, erhud.ui.containers.bottom)
  erhud.ui.consoles.combat = G.MiniConsole:new({name="erhud_combatlog", height="140px", wrapAt=80}, erhud.ui.containers.bottom)
  erhud.ui.consoles.quests = G.MiniConsole:new({name="erhud_quests", height="140px", wrapAt=80}, erhud.ui.containers.bottom)
  erhud.ui.consoles.announce = G.MiniConsole:new({name="erhud_announce", height="140px", wrapAt=80}, erhud.ui.containers.bottom)
  erhud.ui.consoles.debug = G.MiniConsole:new({name="erhud_debug", height="140px", wrapAt=80}, erhud.ui.containers.bottom)

  erhud.ui.hideAllBottomConsoles()
  erhud.ui.showConsole("chat")

  -- Hide the main miniconsole overlap if necessary (user must position main output)
  cecho("<green>[ErHUD]</green> Layout created.\n")
  return true
end

function erhud.ui.hideAllBottomConsoles()
  for _, con in pairs(erhud.ui.consoles or {}) do
    con:hide()
  end
end

function erhud.ui.showConsole(name)
  erhud.ui.hideAllBottomConsoles()
  if erhud.ui.consoles[name] then
    erhud.ui.consoles[name]:show()
  end
end

function erhud.ui.switchTab(tab)
  local map = {
    Chat = "chat",
    CombatLog = "combat",
    Quests = "quests",
    Announcements = "announce",
    Debug = "debug"
  }
  erhud.ui.showConsole(map[tab] or "chat")
end

function erhud.layout.toggleCompact()
  -- Simple responsive stub. Full implementation would resize containers.
  erhud.state.ui.compact = not erhud.state.ui.compact
  cecho(string.format("<cyan>[ErHUD]</cyan> Compact mode: %s\n", tostring(erhud.state.ui.compact)))
  erhud.render.all()
end

function erhud.layout.setMode(mode)
  erhud.state.ui.mode = mode
  if mode == "compact" then erhud.layout.toggleCompact() end
  erhud.render.all()
end
