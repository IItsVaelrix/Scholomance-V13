--[[
  Erion ArcForge HUD
  erhud_aliases.lua
]]

erhud = erhud or {}

function erhud.aliases.setup()
  -- Main help
  tempAlias("^erhud$", function() erhud.help() end)

  tempAlias("^erhud on$", function()
    if erhud.ui.containers and erhud.ui.containers.main then
      erhud.ui.containers.main:show()
    end
    erhud.state.ui.visible = true
    cecho("<green>[ErHUD]</green> HUD shown.\n")
  end)

  tempAlias("^erhud off$", function()
    if erhud.ui.containers and erhud.ui.containers.main then
      erhud.ui.containers.main:hide()
    end
    erhud.state.ui.visible = false
    cecho("<yellow>[ErHUD]</yellow> HUD hidden.\n")
  end)

  tempAlias("^erhud compact$", function()
    erhud.layout.setMode("compact")
  end)

  tempAlias("^erhud full$", function()
    erhud.layout.setMode("full")
  end)

  tempAlias("^erhud reset$", function()
    erhud.resetState()
    erhud.layout.create()
    erhud.render.all()
    cecho("<cyan>[ErHUD]</cyan> Layout reset.\n")
  end)

  tempAlias("^erhud theme (.*)$", function()
    local name = matches[2]:trim()
    erhud.theme.load(name)
    erhud.render.all()
    cecho(string.format("<green>[ErHUD]</green> Theme set to %s\n", name))
  end)

  tempAlias("^erhud debug$", function()
    erhud.debug.printState()
  end)

  tempAlias("^erhud prompt$", function()
    cecho([[<cyan>Recommended Erion prompt:</cyan>
<yellow><%h/%H hp | %m/%M mn | T:%p | XP:%x/%X | G:%g | QP:%C | FP:%y | HPts:%u | MP:%N | A:%a | R:%r | E:%e></yellow>
]])
  end)

  tempAlias("^erhud version$", function()
    cecho("<green>Erion ArcForge HUD v0.1 (Geyser)</green>\n")
  end)
end

function erhud.help()
  cecho([[<cyan>
Erion ArcForge HUD
</cyan>
  <yellow>erhud</yellow>           - this help
  <yellow>erhud on</yellow>         - show HUD
  <yellow>erhud off</yellow>        - hide HUD
  <yellow>erhud compact</yellow>    - compact mode
  <yellow>erhud full</yellow>       - full mode
  <yellow>erhud theme NAME</yellow> - switch theme
  <yellow>erhud debug</yellow>      - dump state
  <yellow>erhud prompt</yellow>     - show recommended prompt
  <yellow>erhud reset</yellow>      - rebuild layout
]])
end
