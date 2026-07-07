--[[
  Vaelrix — Mudlet GMCP Framework
  A clean, professional, extensible base for modern MUDs.

  Usage:
    1. Create a new Script in Mudlet called "Vaelrix"
    2. Paste this entire file
    3. Enable GMCP in your profile (Special Options)
    4. Reconnect

  State lives in the global table:  vaelrix
  Useful functions:
    vaelrix.showVitals()
    vaelrix.debug()
    vaelrix.reset()
]]

-- =============================================================================
-- CONFIGURATION
-- =============================================================================
local VAEL_CONFIG = {
  packageName = "Vaelrix",
  version     = "1.0.0",

  -- Theming (easy to change)
  prefix      = "⟡",                 -- glyph prefix for system messages
  colors      = {
    system    = "#c9a0ff",           -- violet
    success   = "#6ee7b7",           -- green
    warning   = "#f6d27a",           -- gold
    danger    = "#f87171",           -- red
    info      = "#93c5fd",           -- blue
    dim       = "#6b7280",
  },

  -- Vitals field mapping (many MUDs use different names)
  vitalsMap = {
    hp      = {"hp", "health"},
    maxhp   = {"maxhp", "maxhealth", "max_hp"},
    mana    = {"mana", "mp"},
    maxmana = {"maxmana", "maxmp", "max_mana"},
    wp      = {"wp", "willpower", "endurance"},
    maxwp   = {"maxwp", "maxwillpower"},
  },

  -- Create a separate mini console for system messages?
  useSystemConsole = true,
  systemConsoleName = "vaelrix_system",
}

-- =============================================================================
-- GLOBAL STATE
-- =============================================================================
vaelrix = vaelrix or {}

vaelrix.version   = VAEL_CONFIG.version
vaelrix.config    = VAEL_CONFIG
vaelrix.vitals    = {}
vaelrix.room      = {}
vaelrix.affs      = {}
vaelrix.balances  = {}
vaelrix.queue     = {}
vaelrix.flags     = {}
vaelrix.connected = false

-- Internal
local _lastVitalsEcho = 0

-- =============================================================================
-- UTILITIES
-- =============================================================================
local function cechoColor(color, text)
  cecho(string.format("<%s>%s<reset>", color, text))
end

local function sysEcho(msg, color)
  color = color or VAEL_CONFIG.colors.system
  local prefix = VAEL_CONFIG.prefix .. " "

  if VAEL_CONFIG.useSystemConsole and vaelrix.systemConsoleReady then
    -- Write to our custom console once it has been created
    cecho(VAEL_CONFIG.systemConsoleName, string.format("<%s>%s%s<reset>\n", color, prefix, msg))
    return
  end

  cecho(string.format("<%s>%s%s<reset>\n", color, prefix, msg))
end

local function safeNumber(v)
  local n = tonumber(v)
  return n or 0
end

local function getNested(tbl, keys)
  for _, k in ipairs(keys) do
    if type(tbl) == "table" and tbl[k] ~= nil then
      tbl = tbl[k]
    else
      return nil
    end
  end
  return tbl
end

-- =============================================================================
-- GAUGES / UI (Geyser)
-- =============================================================================
local gauges = {}

local function createGauges()
  if not Geyser then
    sysEcho("Geyser not available — skipping fancy gauges. You can still use showVitals().", VAEL_CONFIG.colors.warning)
    return
  end

  -- Only create once
  if gauges.hp then return end

  -- Container at the bottom
  local container = Geyser.Container:new({
    name = "vaelrix_gauges",
    x = "0%", y = "-55px",
    width = "100%", height = "50px",
  })

  gauges.hp = Geyser.Gauge:new({
    name = "vael_hp",
    x = "2%", y = "5px",
    width = "46%", height = "18px",
  }, container)

  gauges.mana = Geyser.Gauge:new({
    name = "vael_mana",
    x = "52%", y = "5px",
    width = "46%", height = "18px",
  }, container)

  -- Style the gauges
  gauges.hp:setColor("#c0264f")
  gauges.hp:setValue(100, 100)
  gauges.hp:setText("HP")

  gauges.mana:setColor("#4f46e5")
  gauges.mana:setValue(100, 100)
  gauges.mana:setText("Mana")

  sysEcho("Gauges initialized.", VAEL_CONFIG.colors.success)
end

local function updateGauges()
  if not gauges.hp or not gauges.mana then return end

  local v = vaelrix.vitals

  local hp     = safeNumber(v.hp)
  local maxhp  = math.max(1, safeNumber(v.maxhp))
  local mana   = safeNumber(v.mana)
  local maxmana = math.max(1, safeNumber(v.maxmana))

  gauges.hp:setValue(hp, maxhp)
  gauges.hp:setText(string.format("HP %d/%d", hp, maxhp))

  gauges.mana:setValue(mana, maxmana)
  gauges.mana:setText(string.format("Mana %d/%d", mana, maxmana))
end

-- =============================================================================
-- GMCP HANDLING
-- =============================================================================
local function handleCoreHello(data)
  sysEcho(string.format("Connected to %s (GMCP ready)", data.server or "unknown server"), VAEL_CONFIG.colors.success)
  vaelrix.connected = true

  -- Request common modules (harmless if server ignores)
  sendGMCP('Core.Supports.Set ["Char 1", "Char.Vitals 2", "Room 1", "Char.Status 1", "Char.Items 1"]')
end

local function handleCharVitals(raw)
  local data = type(raw) == "table" and raw or {}

  local v = vaelrix.vitals

  -- Flexible mapping
  for field, candidates in pairs(VAEL_CONFIG.vitalsMap) do
    for _, cand in ipairs(candidates) do
      if data[cand] ~= nil then
        v[field] = safeNumber(data[cand])
        break
      end
    end
  end

  -- Common direct fields some MUDs use
  if not v.hp and data.hp then v.hp = safeNumber(data.hp) end
  if not v.maxhp and data.maxhp then v.maxhp = safeNumber(data.maxhp) end
  if not v.mana and data.mana then v.mana = safeNumber(data.mana) end
  if not v.maxmana and data.maxmana then v.maxmana = safeNumber(data.maxmana) end

  -- Store raw too for power users
  v.raw = data

  updateGauges()

  -- Throttled pretty echo (not every single vitals tick)
  local now = os.time()
  if now - _lastVitalsEcho > 8 then
    _lastVitalsEcho = now
    -- Only echo if significant change or first time
  end
end

local function handleRoomInfo(data)
  if type(data) ~= "table" then return end

  vaelrix.room = {
    id    = data.id or data.num or data.roomid,
    name  = data.name or data.title,
    area  = data.area or data.zone,
    exits = data.exits or {},
    raw   = data,
  }

  -- Optional: nice room echo
  if vaelrix.room.name then
    sysEcho(string.format("The Weave shifts — you are in %s", vaelrix.room.name), VAEL_CONFIG.colors.info)
  end
end

local function handleCharStatus(data)
  if type(data) ~= "table" then return end
  vaelrix.status = data
end

local function handleCharItems(data)
  -- Very basic inventory / room items capture
  if data.location == "inv" or data.location == "inventory" then
    vaelrix.inventory = data.items or data
  elseif data.location == "room" or data.location == "here" then
    vaelrix.roomItems = data.items or data
  end
end

-- Central GMCP dispatcher
local function onGMCP()
  local msg = gmcp
  if not msg then return end

  local event = gmcp.Event or "unknown"

  -- Core
  if event == "Core.Hello" or gmcp.Core and gmcp.Core.Hello then
    handleCoreHello(gmcp.Core.Hello or msg)
  end

  -- Vitals (multiple possible module paths)
  if gmcp.Char and gmcp.Char.Vitals then
    handleCharVitals(gmcp.Char.Vitals)
  elseif event:find("Char.Vitals") then
    handleCharVitals(msg)
  end

  -- Room
  if gmcp.Room and gmcp.Room.Info then
    handleRoomInfo(gmcp.Room.Info)
  elseif event:find("Room.Info") then
    handleRoomInfo(msg)
  end

  -- Status
  if gmcp.Char and gmcp.Char.Status then
    handleCharStatus(gmcp.Char.Status)
  end

  -- Items
  if gmcp.Char and gmcp.Char.Items then
    handleCharItems(gmcp.Char.Items)
  end

  -- Hook for users to extend
  if vaelrix.onGMCP then
    vaelrix.onGMCP(event, msg)
  end
end

-- =============================================================================
-- PUBLIC API
-- =============================================================================
function vaelrix.showVitals()
  local v = vaelrix.vitals
  if not v or not next(v) then
    sysEcho("No vitals data yet. Connect and wait for GMCP.", VAEL_CONFIG.colors.dim)
    return
  end

  cecho("\n")
  cecho(string.format("<%s>⟡ Vaelrix — Current Weave<reset>\n", VAEL_CONFIG.colors.system))

  local hpLine = string.format("  <red>HP</red>   %d / %d", safeNumber(v.hp), safeNumber(v.maxhp))
  local mpLine = string.format("  <blue>Mana</blue> %d / %d", safeNumber(v.mana), safeNumber(v.maxmana))

  cecho(hpLine .. "\n")
  cecho(mpLine .. "\n")

  if v.wp then
    cecho(string.format("  <yellow>WP</yellow>   %d / %d\n", safeNumber(v.wp), safeNumber(v.maxwp or v.wp)))
  end

  cecho("\n")
end

function vaelrix.debug()
  cecho(string.format("<%s>⟡ Vaelrix Debug Dump<reset>\n", VAEL_CONFIG.colors.system))
  display(vaelrix)
end

function vaelrix.reset()
  vaelrix.vitals   = {}
  vaelrix.room     = {}
  vaelrix.affs     = {}
  vaelrix.balances = {}
  vaelrix.queue    = {}
  vaelrix.flags    = {}
  sysEcho("State cleared.", VAEL_CONFIG.colors.warning)
end

-- Simple command queue (example — expand for real offense/curing)
function vaelrix.queueAdd(cmd)
  table.insert(vaelrix.queue, cmd)
  sysEcho(string.format("Queued: %s", cmd), VAEL_CONFIG.colors.info)
end

function vaelrix.queueShow()
  if #vaelrix.queue == 0 then
    sysEcho("Queue is empty.", VAEL_CONFIG.colors.dim)
    return
  end
  cecho(string.format("<%s>⟡ Current Queue:<reset>\n", VAEL_CONFIG.colors.system))
  for i, cmd in ipairs(vaelrix.queue) do
    cecho(string.format("  %d. %s\n", i, cmd))
  end
end

function vaelrix.queueClear()
  vaelrix.queue = {}
  sysEcho("Queue cleared.", VAEL_CONFIG.colors.warning)
end

function vaelrix.queueProcess()
  if #vaelrix.queue == 0 then return end
  local cmd = table.remove(vaelrix.queue, 1)
  send(cmd)
  sysEcho("Executed: " .. cmd, VAEL_CONFIG.colors.success)
end

-- =============================================================================
-- ALIASES
-- =============================================================================
function vaelrix.setupAliases()
  -- Vitals
  tempAlias("^vv$", function() vaelrix.showVitals() end)
  tempAlias("^vitals$", function() vaelrix.showVitals() end)

  -- Queue helpers
  tempAlias("^qr\\s+(.+)$", function() vaelrix.queueAdd(matches[2]) end)
  tempAlias("^qs$", function() vaelrix.queueShow() end)
  tempAlias("^qc$", function() vaelrix.queueClear() end)
  tempAlias("^qp$", function() vaelrix.queueProcess() end)

  -- Debug
  tempAlias("^vdebug$", function() vaelrix.debug() end)
  tempAlias("^vreset$", function() vaelrix.reset() end)

  sysEcho("Aliases registered.", VAEL_CONFIG.colors.dim)
end

-- =============================================================================
-- TRIGGERS (lightweight examples)
-- =============================================================================
function vaelrix.setupTriggers()
  -- You died
  tempTrigger("You have been slain", function()
    sysEcho("The glyph shatters. You have fallen.", VAEL_CONFIG.colors.danger)
    vaelrix.flags.dead = true
  end)

  -- Simple prompt capture fallback (if no GMCP vitals)
  tempTrigger("^H:(\\d+)/(\\d+) M:(\\d+)/(\\d+)", function()
    if not vaelrix.vitals or not vaelrix.vitals.hp then
      vaelrix.vitals.hp = safeNumber(matches[2])
      vaelrix.vitals.maxhp = safeNumber(matches[3])
      vaelrix.vitals.mana = safeNumber(matches[4])
      vaelrix.vitals.maxmana = safeNumber(matches[5])
      updateGauges()
    end
  end)

  sysEcho("Basic triggers registered.", VAEL_CONFIG.colors.dim)
end

-- =============================================================================
-- SYSTEM CONSOLE (optional nice window)
-- =============================================================================
local function createSystemConsole()
  if not VAEL_CONFIG.useSystemConsole then return end

  -- Create a small docked console for system messages
  local name = VAEL_CONFIG.systemConsoleName

  if not vaelrix.systemConsoleReady then
    createMiniConsole(name, 0, 0, 400, 120)
    setWindowWrap(name, 60)
    setBackgroundColor(name, 20, 18, 30, 220)
    -- moveWindow takes numeric x,y — anchor the 120px-tall console to the bottom
    local _, mainH = getMainWindowSize()
    moveWindow(name, 0, (mainH or 600) - 120)
    vaelrix.systemConsoleReady = true
    -- You can dock/resize manually in Mudlet
  end

  sysEcho("System console ready (you can drag/resize it).")
end

-- =============================================================================
-- INITIALIZATION
-- =============================================================================
local function initialize()
  sysEcho(string.format("Vaelrix v%s initializing...", VAEL_CONFIG.version), VAEL_CONFIG.colors.system)

  createGauges()
  createSystemConsole()

  vaelrix.setupAliases()
  vaelrix.setupTriggers()

  -- Register GMCP listener
  if registerAnonymousEventHandler then
    registerAnonymousEventHandler("gmcp", onGMCP)
  else
    -- Fallback for very old Mudlet
    tempTimer(0.5, [[if gmcp then onGMCP() end]])
  end

  -- Auto-request GMCP modules after connect (in case)
  tempTimer(2, function()
    if vaelrix.connected == false and sendGMCP then
      sendGMCP('Core.Supports.Set ["Char 1", "Char.Vitals 2", "Room 1"]')
    end
  end)

  sysEcho("Ready. The Weave awaits.", VAEL_CONFIG.colors.success)

  -- Hook for further extension
  if vaelrix.onInit then vaelrix.onInit() end
end

-- Auto-start when this script is loaded/saved
initialize()

-- Also try to init on profile load if already connected
tempTimer(1, function()
  if gmcp and not vaelrix.connected then
    onGMCP()
  end
end)

-- =============================================================================
-- EXTENSION POINTS (for you to hook into)
-- =============================================================================
--[[
  Example usage in another script:

  vaelrix.onVitalsUpdate = function()
    if vaelrix.vitals.hp < 30 then
      send("eat potion")
    end
  end

  vaelrix.onRoomUpdate = function()
    -- auto look for aggressive mobs, etc.
  end
]]

print("Vaelrix loaded successfully.")