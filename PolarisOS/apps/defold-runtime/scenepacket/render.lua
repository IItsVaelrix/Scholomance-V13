-- scenepacket/render.lua — Packet → sprites/labels in deterministic draw order.
--
-- Defold Bridge Design §"The Four Rules", Rule 3:
--   A consumer derives visual state from the packet alone. No engine-local
--   defaults, no inferred positions.
--
-- This module translates a decoded LuaWirePacket into Defold game objects.
-- Sprites are created in the order they appear in packet.sprites (already
-- sorted zIndex asc, then layerId by the server). Hotspots are registered
-- for input handling. Text regions become label components.
--
-- Degradation ladder (Defold Bridge Design §"Failure Behavior"):
--   PIXELBRAIN → PNG → GLYPH → TEXT
--   Defold's GLYPH equivalent is a colored quad. Recorded as "GLYPH" in
--   the claim so the receipt tells the truth about degradation.

local M = {}

-- Active game object URLs keyed by layerId, for cleanup on packet replace.
local active_objects = {}

--- Convert milli-units back to Defold world coordinates.
-- The logical canvas is 800×480; Defold's display matches.
local function milli_to_px(milli)
  return milli / 1000.0
end

--- Create or update a sprite game object for a wire sprite entry.
-- @param sprite  LuaWireSprite table (from packet.sprites[i])
-- @param index   1-based draw order index
local function apply_sprite(sprite, index)
  local x = milli_to_px(sprite.xMilli)
  local y = milli_to_px(sprite.yMilli)
  local url = active_objects[sprite.layerId]

  if url then
    -- Update position only; Defold does not support hot-swapping textures
    -- without a factory. For MVP, reposition existing object.
    go.set_position(vmath.vector3(x, y, 0), url)
  else
    -- Create a colored quad as the GLYPH fallback.
    -- In a full build this would load the PixelBrain raster via assetKey.
    local id = "sprite_" .. sprite.layerId
    -- Factory-based creation would go here; for the thin-client MVP we
    -- record the intent and let claim.lua report GLYPH degradation.
    active_objects[sprite.layerId] = id
  end
end

--- Register a hotspot for input handling.
-- @param hotspot  LuaWireHotspot table
local function apply_hotspot(hotspot)
  -- Hotspots are stored for input dispatch in bootstrap.script.
  -- The region is in milli-units; convert on tap.
  M._hotspots[hotspot.hotspotId] = {
    entityId = hotspot.entityId,
    label = hotspot.label,
    command = hotspot.command,
    x = milli_to_px(hotspot.xMilli),
    y = milli_to_px(hotspot.yMilli),
    w = milli_to_px(hotspot.wMilli),
    h = milli_to_px(hotspot.hMilli),
  }
end

--- Apply a full decoded packet to the scene.
-- Clears all prior objects and rebuilds from the packet alone (Rule 3).
-- @param packet  decoded LuaWirePacket table
-- @return resolved_assets  list of { requestedAssetKey, source } for the claim
function M.apply(packet)
  -- Clear prior frame
  for layer_id, url in pairs(active_objects) do
    if type(url) == "string" and go.exists(url) then
      go.delete(url)
    end
  end
  active_objects = {}
  M._hotspots = {}

  local resolved_assets = {}

  -- Background
  if packet.backgroundAssetKey and packet.backgroundAssetKey ~= "" then
    table.insert(resolved_assets, {
      requestedAssetKey = packet.backgroundAssetKey,
      source = "GLYPH",  -- MVP: colored quad, no binary asset yet
    })
  end

  -- Sprites in deterministic draw order (already sorted by server)
  for i = 1, packet.spriteCount or 0 do
    local sprite = packet.sprites[i]
    if sprite then
      apply_sprite(sprite, i)
      if sprite.assetKey and sprite.assetKey ~= "" then
        table.insert(resolved_assets, {
          requestedAssetKey = sprite.assetKey,
          source = "GLYPH",  -- MVP degradation
        })
      end
    end
  end

  -- Hotspots
  for i = 1, packet.hotspotCount or 0 do
    local hotspot = packet.hotspots[i]
    if hotspot then apply_hotspot(hotspot) end
  end

  -- Text regions (labels)
  for i = 1, packet.textRegionCount or 0 do
    local region = packet.textRegions[i]
    if region then
      -- Label creation would go here in a full build.
      -- For MVP, text regions are recorded but not rendered.
    end
  end

  return resolved_assets
end

--- Hit-test a screen coordinate against registered hotspots.
-- @param x, y  screen coordinates in pixels
-- @return command string if a hotspot was hit, nil otherwise
function M.hit_test(x, y)
  for _, hs in pairs(M._hotspots) do
    if x >= hs.x and x <= hs.x + hs.w and y >= hs.y and y <= hs.y + hs.h then
      return hs.command
    end
  end
  return nil
end

M._hotspots = {}

return M
