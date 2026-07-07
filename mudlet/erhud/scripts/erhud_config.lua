--[[
  Erion ArcForge HUD
  erhud_config.lua
]]

erhud = erhud or {}
erhud.config = erhud.config or {}

erhud.config = {
  theme = "arcane_glass",
  mode = "full",

  warnings = {
    hpLow = 35,
    hpCritical = 20,
    manaLow = 20,
    partyCritical = 25,
  },

  commands = {
    recall = "recall",
    rest = "rest",
    stand = "stand",
    flee = "flee",
    quest = "quest",
    inventory = "inventory",
    equipment = "equipment",
    score = "score",
    map = "map",
    where = "where",
  },

  panels = {
    vitals = true,
    combat = true,
    room = true,
    party = true,
    quests = true,
    chat = true,
    minimap = true,
    economy = true,
    commands = true,
  },

  safety = {
    confirmFlee = true,
    confirmRecall = true,
    allowAutoCombat = false,
  },

  layout = {
    leftWidth = "18%",
    minLeftWidth = 220,
    rightWidth = "20%",
    minRightWidth = 260,
    bottomHeight = 160,
  }
}

function erhud.loadConfig()
  -- In future: persist via getMudletHomeDir or table save
  -- For now use defaults + allow runtime overrides
  return erhud.config
end

function erhud.saveConfig()
  -- Placeholder for future persistence
end
