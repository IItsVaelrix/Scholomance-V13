--[[
  Erion ArcForge HUD
  erhud_state.lua

  Normalized central state. Everything funnels here.
  Triggers/protocol update state.
  Renderer reads state.
]]

erhud = erhud or {}
erhud.state = erhud.state or {}

-- Full schema from the spec
erhud.state = {
  player = {
    name = nil,
    hp = 0,
    maxHp = 0,
    mana = 0,
    maxMana = 0,
    xp = 0,
    xpToLevel = 0,
    xpPercent = 0,
    alignment = nil,
    level = nil,
    race = nil,
    mainClass = nil,
    targetClass = nil,
    classes = {},
  },

  economy = {
    gold = 0,
    questpoints = 0,
    faith = 0,
    house = 0,
    mudpies = 0,
  },

  combat = {
    active = false,
    targetName = nil,
    targetHpPercent = nil,
    targetFlags = {
      blinded = false,
      dazed = false,
      stunned = false,
    },
    petHpPercent = nil,
    lastIncoming = nil,
    lastOutgoing = nil,
  },

  room = {
    name = nil,
    area = nil,
    exits = {
      n = false, e = false, s = false,
      w = false, u = false, d = false,
    },
    unexplored = {
      n = false, e = false, s = false,
      w = false, u = false, d = false,
    },
  },

  party = {
    members = {}  -- { {name, hpPercent}, ... }
  },

  quests = {
    active = {},
    recent = {}
  },

  chat = {
    recent = {},
    unread = 0
  },

  ui = {
    mode = "full",
    theme = "arcane_glass",
    dirty = {},           -- panel keys that need re-render
    compact = false,
    visible = true
  }
}

function erhud.resetState()
  erhud.state = {
    player = {
      name = erhud.state.player and erhud.state.player.name,
      hp = 0, maxHp = 0, mana = 0, maxMana = 0,
      xp = 0, xpToLevel = 0, xpPercent = 0,
      alignment = nil, level = nil, race = nil,
      mainClass = nil, targetClass = nil, classes = {},
    },
    economy = { gold = 0, questpoints = 0, faith = 0, house = 0, mudpies = 0 },
    combat = {
      active = false, targetName = nil, targetHpPercent = nil,
      targetFlags = { blinded = false, dazed = false, stunned = false },
      petHpPercent = nil, lastIncoming = nil, lastOutgoing = nil,
    },
    room = {
      name = nil, area = nil,
      exits = { n = false, e = false, s = false, w = false, u = false, d = false },
      unexplored = { n = false, e = false, s = false, w = false, u = false, d = false },
    },
    party = { members = {} },
    quests = { active = {}, recent = {} },
    chat = { recent = {}, unread = 0 },
    ui = erhud.state.ui or { mode = "full", theme = "arcane_glass", dirty = {}, compact = false, visible = true }
  }
end

-- Helper to get nested safely
function erhud.getState(path)
  local node = erhud.state
  for _, key in ipairs(path) do
    if type(node) ~= "table" then return nil end
    node = node[key]
  end
  return node
end
