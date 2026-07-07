local spr = app.open("docs/references/bespoke-chest3-aseprite.aseprite")
if not spr then return print("failed to open") end

app.activeSprite = spr

local glowColor1 = app.pixelColor.rgba(70, 226, 255, 255)
local glowColor2 = app.pixelColor.rgba(232, 251, 255, 255)

local lidLayers = {
  "silhouette", "lid", "rails", "straps", "corners", "lockplate", "runes", "rivets"
}

-- Create Glow Layer
local glowLayer = spr:newLayer()
glowLayer.name = "glow"
for i, l in ipairs(spr.layers) do
  if l.name == "body" then
    glowLayer.stackIndex = l.stackIndex + 1
    break
  end
end

local function shiftLid(cel, dy)
  if not cel then return end
  local img = cel.image:clone()
  local srcImg = cel.image
  img:clear()
  
  for y = 0, img.height-1 do
    for x = 0, img.width-1 do
      local p = srcImg:getPixel(x, y)
      if p ~= 0 then
        local globalY = cel.position.y + y
        if globalY <= 19 then
          img:drawPixel(x, y + dy, p)
        else
          img:drawPixel(x, y, p)
        end
      end
    end
  end
  cel.image = img
end

local function drawGlow(cel, intensity)
  local img = cel.image
  local bounds = {x1=24, y1=20, x2=55, y2=20 + intensity*1.5}
  for y = bounds.y1, bounds.y2 do
    for x = bounds.x1, bounds.x2 do
      if math.random() > 0.2 then
        img:drawPixel(x - cel.position.x, y - cel.position.y, (math.random() > 0.5) and glowColor2 or glowColor1)
      end
    end
  end
end

local framesData = {
  { dy = 0,  duration = 250 / 1000 },
  { dy = -3, duration = 80 / 1000 },
  { dy = -6, duration = 80 / 1000 },
  { dy = -8, duration = 100 / 1000 },
  { dy = -8, duration = 300 / 1000 },
  { dy = -8, duration = 120 / 1000 },
  { dy = -7, duration = 160 / 1000 }
}

for i = 2, #framesData do
  spr:newFrame()
end

for f = 1, #framesData do
  local frame = spr.frames[f]
  local data = framesData[f]
  local dy = data.dy
  
  frame.duration = data.duration
  
  for _, layerName in ipairs(lidLayers) do
    for i, l in ipairs(spr.layers) do
      if l.name == layerName then
        local cel = l:cel(f)
        if cel then
          shiftLid(cel, dy)
        end
      end
    end
  end
  
  if dy < 0 then
    -- Draw glow
    local gcel = glowLayer:cel(f)
    if not gcel then
      local gImg = Image(spr.width, spr.height, spr.colorMode)
      gcel = spr:newCel(glowLayer, f, gImg, Point(0,0))
    end
    local intensity = (f == 4) and math.abs(dy) * 1.5 or math.abs(dy)
    drawGlow(gcel, intensity)
  end
end

spr:saveCopyAs("docs/references/bespoke-chest-animated.aseprite")
spr:saveCopyAs("docs/references/bespoke-chest-animated.gif")
