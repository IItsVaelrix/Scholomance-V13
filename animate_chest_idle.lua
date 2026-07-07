local spr = app.open("docs/references/bespoke-chest3-aseprite.aseprite")
if not spr then return print("failed to open") end

app.activeSprite = spr

local goldColor = app.pixelColor.rgba(239, 188, 72, 255)
local whiteColor = app.pixelColor.rgba(255, 255, 255, 255)

local sparkleLayer = spr:newLayer()
sparkleLayer.name = "sparkles"
sparkleLayer.stackIndex = #spr.layers -- put it at the very top

-- The chest bounds are roughly X: 15 to 63, Y: 7 to 40
-- The gold edges (rails and straps) are around:
-- Top rail: Y=18-20, X=15-63
-- Bottom rail: Y=35-37, X=16-62
-- Left strap: X=27-28, Y=18-36
-- Right strap: X=49-50, Y=18-36
local edgeRegions = {
  {x1=15, y1=18, x2=63, y2=20}, -- top rail
  {x1=16, y1=35, x2=62, y2=37}, -- bottom rail
  {x1=27, y1=18, x2=28, y2=36}, -- left strap
  {x1=49, y1=18, x2=50, y2=36}  -- right strap
}

local function drawSparkle(img, x, y, frameIndex)
  -- A sparkle sequence over 3 frames
  local state = frameIndex % 3
  if state == 0 then
    img:drawPixel(x, y, goldColor)
  elseif state == 1 then
    img:drawPixel(x, y, whiteColor)
    img:drawPixel(x-1, y, goldColor)
    img:drawPixel(x+1, y, goldColor)
    img:drawPixel(x, y-1, goldColor)
    img:drawPixel(x, y+1, goldColor)
  elseif state == 2 then
    img:drawPixel(x, y, goldColor)
  end
end

local framesCount = 8
for i = 2, framesCount do
  spr:newFrame()
end

-- Pre-calculate some random sparkle positions that persist for a few frames
local activeSparkles = {}

for f = 1, framesCount do
  local frame = spr.frames[f]
  frame.duration = 150 / 1000 -- 150ms per frame
  
  -- Maybe spawn a new sparkle
  if math.random() > 0.3 then
    local region = edgeRegions[math.random(#edgeRegions)]
    local sx = math.random(region.x1, region.x2)
    local sy = math.random(region.y1, region.y2)
    table.insert(activeSparkles, {x = sx, y = sy, startFrame = f})
  end
  
  local gImg = Image(spr.width, spr.height, spr.colorMode)
  local cel = spr:newCel(sparkleLayer, f, gImg, Point(0,0))
  
  -- Update and draw sparkles
  for i = #activeSparkles, 1, -1 do
    local s = activeSparkles[i]
    local age = f - s.startFrame
    if age >= 0 and age < 3 then
      drawSparkle(gImg, s.x, s.y, age)
    end
    if age >= 3 then
      table.remove(activeSparkles, i)
    end
  end
end

spr:saveCopyAs("docs/references/bespoke-chest-idle.aseprite")
spr:saveCopyAs("docs/references/bespoke-chest-idle.gif")
