-- scenepacket/packet.lua — Decode, seal equality, revision gate.
--
-- Defold Bridge Design §"The Four Rules":
--   Rule 1: Only the server computes the seal. Lua never recomputes it.
--   Rule 2: A consumer that cannot match the seal refuses the packet and
--           holds its last verified frame, emitting SEAL_MISMATCH. Never
--           best-effort.
--   Rule 3: A consumer derives visual state from the packet alone. No
--           engine-local defaults, no inferred positions.
--   Rule 4: roomRevision/sequence form a monotonic gate. A packet older
--           than what is on screen is dropped regardless of frame timing.
--
-- Lua never computes a hash. Seal verification is string equality only.

local M = {}

-- Maximum packet size before decode (mirrors MAX_PACKET_BYTES).
M.MAX_PACKET_BYTES = 1048576  -- 1 MiB

--- Decode a raw JSON string into a packet table.
-- Returns packet, nil on success; nil, error_string on failure.
-- Applies the byte cap BEFORE decode (Defold Bridge Design §"Failure Behavior").
function M.decode(raw)
  if type(raw) ~= "string" then
    return nil, "MALFORMED_JSON: not a string"
  end
  if #raw > M.MAX_PACKET_BYTES then
    return nil, "OVERSIZED_PAYLOAD: " .. #raw .. " bytes exceeds " .. M.MAX_PACKET_BYTES
  end
  local ok, packet = pcall(json.decode, raw)
  if not ok or type(packet) ~= "table" then
    return nil, "MALFORMED_JSON: " .. tostring(packet)
  end
  return packet, nil
end

--- Verify the seal by string equality (Rule 1 + Rule 2).
-- @param packet      decoded packet table
-- @param held_seal   seal from last verified frame, or nil if first packet
-- @return true if the packet should be applied; false, reason otherwise
function M.verify_seal(packet, held_seal)
  if held_seal == nil then
    -- First packet: no prior frame. Accept.
    return true
  end
  local seal = packet.seal
  if type(seal) ~= "string" or seal:sub(1, 6) ~= "plan1:" then
    return false, "MALFORMED_SEAL"
  end
  if seal ~= held_seal then
    return false, "SEAL_MISMATCH"
  end
  return true
end

--- Monotonic revision gate (Rule 4).
-- @param packet   decoded packet table
-- @param current  { roomRevision = N, sequence = N } or nil if first packet
-- @return true if the packet is newer and should be applied
function M.passes_revision_gate(packet, current)
  if current == nil then return true end
  local rev = packet.roomRevision or 0
  local seq = packet.sequence or 0
  if rev < current.roomRevision then return false end
  if rev == current.roomRevision and seq <= current.sequence then return false end
  return true
end

--- Full packet acceptance pipeline: decode → revision gate → seal check.
-- Returns packet, nil on accept; nil, reason on reject.
-- On reject the caller MUST hold its last verified frame (Rule 2).
function M.accept(raw, current_state)
  local packet, err = M.decode(raw)
  if not packet then return nil, err end

  if not M.passes_revision_gate(packet, current_state) then
    return nil, "STALE_REVISION"
  end

  local held_seal = current_state and current_state.seal or nil
  local ok, reason = M.verify_seal(packet, held_seal)
  if not ok then return nil, reason end

  return packet, nil
end

return M
