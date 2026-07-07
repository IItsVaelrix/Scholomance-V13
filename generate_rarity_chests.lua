local spr = app.open("docs/references/bespoke-chest-animated4.aseprite")
if not spr then return print("failed to open") end

app.activeSprite = spr

local rarities = {
  {
    tier = "common",
    wood_lit = app.pixelColor.rgba(160, 160, 160, 255),
    wood_mid = app.pixelColor.rgba(110, 110, 110, 255),
    wood_shadow = app.pixelColor.rgba(70, 70, 70, 255),
    wood_deep = app.pixelColor.rgba(45, 45, 45, 255),
    magic_cyan = app.pixelColor.rgba(122, 130, 142, 255),
    magic_core = app.pixelColor.rgba(177, 187, 201, 255),
    magic_deep = app.pixelColor.rgba(29, 35, 42, 255)
  },
  {
    tier = "uncommon",
    wood_lit = app.pixelColor.rgba(112, 186, 91, 255),
    wood_mid = app.pixelColor.rgba(66, 135, 49, 255),
    wood_shadow = app.pixelColor.rgba(36, 82, 25, 255),
    wood_deep = app.pixelColor.rgba(21, 51, 14, 255),
    magic_cyan = app.pixelColor.rgba(72, 181, 78, 255),
    magic_core = app.pixelColor.rgba(178, 255, 184, 255),
    magic_deep = app.pixelColor.rgba(27, 79, 32, 255)
  },
  {
    tier = "rare",
    wood_lit = app.pixelColor.rgba(75, 129, 214, 255),
    wood_mid = app.pixelColor.rgba(38, 77, 153, 255),
    wood_shadow = app.pixelColor.rgba(19, 43, 94, 255),
    wood_deep = app.pixelColor.rgba(10, 24, 56, 255),
    magic_cyan = app.pixelColor.rgba(40, 102, 242, 255),
    magic_core = app.pixelColor.rgba(163, 201, 255, 255),
    magic_deep = app.pixelColor.rgba(13, 30, 87, 255)
  },
  {
    tier = "mythic",
    wood_lit = app.pixelColor.rgba(174, 90, 219, 255),
    wood_mid = app.pixelColor.rgba(116, 49, 153, 255),
    wood_shadow = app.pixelColor.rgba(68, 24, 94, 255),
    wood_deep = app.pixelColor.rgba(41, 13, 59, 255),
    magic_cyan = app.pixelColor.rgba(170, 43, 226, 255),
    magic_core = app.pixelColor.rgba(238, 175, 255, 255),
    magic_deep = app.pixelColor.rgba(62, 11, 107, 255)
  },
  {
    tier = "legendary",
    wood_lit = app.pixelColor.rgba(240, 185, 60, 255),
    wood_mid = app.pixelColor.rgba(189, 121, 25, 255),
    wood_shadow = app.pixelColor.rgba(117, 68, 12, 255),
    wood_deep = app.pixelColor.rgba(66, 36, 5, 255),
    magic_cyan = app.pixelColor.rgba(255, 140, 0, 255),
    magic_core = app.pixelColor.rgba(255, 235, 179, 255),
    magic_deep = app.pixelColor.rgba(139, 37, 0, 255)
  },
  {
    tier = "source",
    wood_lit = app.pixelColor.rgba(76, 210, 222, 255),
    wood_mid = app.pixelColor.rgba(36, 140, 153, 255),
    wood_shadow = app.pixelColor.rgba(17, 81, 92, 255),
    wood_deep = app.pixelColor.rgba(10, 48, 56, 255),
    magic_cyan = app.pixelColor.rgba(70, 226, 255, 255),
    magic_core = app.pixelColor.rgba(232, 251, 255, 255),
    magic_deep = app.pixelColor.rgba(92, 42, 137, 255)
  }
}

local origCyan = app.pixelColor.rgba(70, 226, 255, 255)
local origCore = app.pixelColor.rgba(232, 251, 255, 255)
local origDeep = app.pixelColor.rgba(92, 42, 137, 255)

local origWoodLit = app.pixelColor.rgba(207, 132, 56, 255)
local origWoodMid = app.pixelColor.rgba(139, 77, 32, 255)
local origWoodShadow = app.pixelColor.rgba(78, 38, 15, 255)
local origWoodDeep = app.pixelColor.rgba(54, 27, 11, 255)

local function replaceColors(image, rarity)
  for y = 0, image.height-1 do
    for x = 0, image.width-1 do
      local p = image:getPixel(x, y)
      if p == origCyan then image:drawPixel(x, y, rarity.magic_cyan)
      elseif p == origCore then image:drawPixel(x, y, rarity.magic_core)
      elseif p == origDeep then image:drawPixel(x, y, rarity.magic_deep)
      elseif p == origWoodLit then image:drawPixel(x, y, rarity.wood_lit)
      elseif p == origWoodMid then image:drawPixel(x, y, rarity.wood_mid)
      elseif p == origWoodShadow then image:drawPixel(x, y, rarity.wood_shadow)
      elseif p == origWoodDeep then image:drawPixel(x, y, rarity.wood_deep)
      end
    end
  end
end

for _, rarity in ipairs(rarities) do
  app.command.DuplicateSprite()
  local dup = app.activeSprite
  
  if dup.colorMode == ColorMode.INDEXED then
    app.command.ChangePixelFormat{ format="rgb" }
  end
  
  for i, layer in ipairs(dup.layers) do
    if not layer.isGroup then
      for j, frame in ipairs(dup.frames) do
        local cel = layer:cel(j)
        if cel then
          replaceColors(cel.image, rarity)
        end
      end
    end
  end
  
  -- Use Aseprite format syntax {frame0} to export every frame indexed from 0
  dup:saveCopyAs("generated-assets/LootChest/LootChest-" .. rarity.tier .. "-f{frame0}-png.png")
  dup:close()
  app.activeSprite = spr
end

spr:close()
