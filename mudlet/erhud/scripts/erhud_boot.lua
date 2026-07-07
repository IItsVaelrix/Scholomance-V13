--[[
  Erion ArcForge HUD
  erhud_boot.lua

  Main entry point. Loads everything in the correct order.
]]

erhud = erhud or {}

function erhud.boot()
  erhud.config = erhud.loadConfig and erhud.loadConfig() or erhud.config or {}
  erhud.state = erhud.state or {}

  erhud.theme.load(erhud.config.theme or "arcane_glass")

  if not erhud.layout.create() then
    return
  end

  -- Data sources (order = priority)
  erhud.gmcp.setup()
  erhud.msdp.setup()

  erhud.prompt.setupCapture()
  erhud.chat.setupTriggers()
  erhud.quests.setupTriggers()
  erhud.party.setupTriggers()

  erhud.commands.setupDock()

  -- Render everything
  erhud.render.all()

  -- Periodic render tick (cheap because of dirty flags)
  if not erhud._tickTimer then
    erhud._tickTimer = tempTimer(0.4, function()
      erhud.render.tick()
    end, true)
  end

  cecho("<green>[Erion HUD]</green> ArcForge v0.1 loaded. Type 'erhud' for commands.\n")
  erhud.debug.log("Boot complete")
end

function erhud.shutdown()
  -- Clean up timers/handlers if needed in future
  cecho("<yellow>[ErHUD]</yellow> HUD shutdown (partial).\n")
end
