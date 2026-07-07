--[[
  Erion ArcForge HUD
  erhud_theme.lua

  "Arcane Glass Terminal" theme
  Dark fantasy control panel.
]]

erhud = erhud or {}
erhud.theme = erhud.theme or {}

local palette = {
  ["arcane_glass"] = {
    bg_deep     = "#090B10",
    bg_panel    = "#111722",
    bg_raised   = "#182233",
    line_dim    = "#263246",
    text_main   = "#D8E3F0",
    text_muted  = "#8290A4",
    hp_good     = "#42D96B",
    hp_warn     = "#F3C969",
    hp_bad      = "#F25F5C",
    mana        = "#5CA9FF",
    xp          = "#B56DFF",
    gold        = "#FFD166",
    quest       = "#7EE7C8",
    void        = "#9B5DE5",
    accent      = "#c9a0ff",
  }
}

function erhud.theme.load(name)
  name = name or "arcane_glass"
  erhud.theme.current = palette[name] or palette["arcane_glass"]
  erhud.theme.name = name
  return erhud.theme.current
end

function erhud.theme.get(key)
  local p = erhud.theme.current or palette["arcane_glass"]
  return p[key] or "#ffffff"
end

function erhud.theme.colorize(text, key)
  return string.format("<%s>%s<reset>", erhud.theme.get(key), text)
end
