-- scenepacket/claim.lua — Collect resolved-asset facts, report upward.
--
-- Defold Bridge Design §"Components / apps/defold-runtime":
--   Lua never computes a hash and never mints a receipt. Defold reports a
--   claim (seal + engine + mode + resolved assets); the bridge mints the
--   receipt in TypeScript.
--
-- The claim is a plain JSON object sent back over the WebSocket as a
-- "render.claim" message. The server (or a CI harness) mints the receipt
-- and compares it against PixiJS's receipt for the same sealed packet.

local M = {}

--- Build a RenderReceiptClaim from the current render state.
-- @param seal             the seal of the packet that was rendered
-- @param mode             "illustrated" or "fallback"
-- @param resolved_assets  list of { requestedAssetKey = string, source = string }
-- @return claim table ready for json.encode
function M.build_claim(seal, mode, resolved_assets)
  local assets = {}
  for i, asset in ipairs(resolved_assets or {}) do
    assets[i] = {
      requestedAssetKey = asset.requestedAssetKey or "",
      source = asset.source or "GLYPH",
      -- Null fields omitted entirely (Lua has no null; absent = null on decode).
      -- The bridge's parseDefoldClaim treats absent as null.
    }
    -- Only include non-empty optional fields to avoid Lua empty-string ambiguity.
    if asset.packetId and asset.packetId ~= "" then
      assets[i].packetId = asset.packetId
    end
    if asset.packetContentHash and asset.packetContentHash ~= "" then
      assets[i].packetContentHash = asset.packetContentHash
    end
    if asset.rasterHash and asset.rasterHash ~= "" then
      assets[i].rasterHash = asset.rasterHash
    end
    if asset.pngRevision and asset.pngRevision ~= "" then
      assets[i].pngRevision = asset.pngRevision
    end
  end

  return {
    type = "render.claim",
    seal = seal,
    engine = "defold",
    mode = mode,
    resolvedAssets = assets,
  }
end

--- Serialize a claim to JSON for transmission.
-- @param claim  table from build_claim()
-- @return JSON string
function M.encode_claim(claim)
  return json.encode(claim)
end

return M
