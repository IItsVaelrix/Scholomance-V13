-- tests/packet_test.lua — Lua unit tests for scenepacket/packet.lua
--
-- Run with: luajit tests/packet_test.lua
-- (or lua5.4 tests/packet_test.lua)
--
-- Defold Bridge Design §"Testing / Lua":
--   - Revision gate: out-of-order and stale packets dropped.
--   - Fail-closed on seal mismatch.
--   - Malformed JSON rejected without crash.
--   - Oversized payload rejected before decode.

-- Stub json global (Defold provides it; luajit does not).
if not json then
  json = {
    encode = function(v)
      -- Minimal encoder for test purposes
      if type(v) == "table" then
        local parts = {}
        for k, val in pairs(v) do
          parts[#parts + 1] = '"' .. tostring(k) .. '":' .. json.encode(val)
        end
        return "{" .. table.concat(parts, ",") .. "}"
      elseif type(v) == "string" then
        return '"' .. v .. '"'
      elseif type(v) == "number" then
        return tostring(v)
      elseif type(v) == "boolean" then
        return tostring(v)
      else
        return "null"
      end
    end,
    decode = function(s)
      if type(s) ~= "string" then error("json.decode: expected string") end
      -- Reject obviously malformed input (no opening brace)
      if not s:match("^%s*{") then error("json.decode: malformed JSON") end
      -- Use a simple pattern-based decoder for test packets
      local t = {}
      for k, v in s:gmatch('"([^"]+)":([^,}]+)') do
        v = v:match("^%s*(.-)%s*$")
        if v:match("^%-?%d+$") then
          t[k] = tonumber(v)
        elseif v:match('^"') then
          t[k] = v:match('^"(.*)"')
        elseif v == "true" then
          t[k] = true
        elseif v == "false" then
          t[k] = false
        else
          t[k] = v
        end
      end
      return t
    end,
  }
end

package.path = package.path .. ";../?.lua;./?.lua"
local packet = require("scenepacket.packet")

local passed = 0
local failed = 0

local function assert_eq(name, got, want)
  if got == want then
    passed = passed + 1
  else
    failed = failed + 1
    print("FAIL: " .. name .. " — got " .. tostring(got) .. ", want " .. tostring(want))
  end
end

local function assert_true(name, val)
  assert_eq(name, val, true)
end

local function assert_false(name, val)
  assert_eq(name, val, false)
end

-- --- decode tests ---

assert_true("decode: valid JSON returns table",
  type(packet.decode('{"roomRevision":1,"sequence":1,"seal":"plan1:abc"}')) == "table")

local _, err = packet.decode("not json at all {{{")
assert_true("decode: malformed JSON returns error", err ~= nil)

local _, err2 = packet.decode(string.rep("x", packet.MAX_PACKET_BYTES + 1))
assert_true("decode: oversized payload rejected before decode",
  err2 ~= nil and err2:find("OVERSIZED") ~= nil)

local _, err3 = packet.decode(12345)
assert_true("decode: non-string input rejected", err3 ~= nil)

-- --- verify_seal tests ---

assert_true("verify_seal: first packet (nil held_seal) accepted",
  packet.verify_seal({ seal = "plan1:abc" }, nil))

assert_true("verify_seal: matching seal accepted",
  packet.verify_seal({ seal = "plan1:abc" }, "plan1:abc"))

local ok, reason = packet.verify_seal({ seal = "plan1:xyz" }, "plan1:abc")
assert_false("verify_seal: mismatched seal rejected", ok)
assert_eq("verify_seal: reason is SEAL_MISMATCH", reason, "SEAL_MISMATCH")

local ok2, reason2 = packet.verify_seal({ seal = "bad" }, "plan1:abc")
assert_false("verify_seal: malformed seal rejected", ok2)
assert_eq("verify_seal: reason is MALFORMED_SEAL", reason2, "MALFORMED_SEAL")

-- --- passes_revision_gate tests ---

assert_true("revision_gate: first packet (nil current) accepted",
  packet.passes_revision_gate({ roomRevision = 0, sequence = 1 }, nil))

assert_true("revision_gate: newer revision accepted",
  packet.passes_revision_gate({ roomRevision = 2, sequence = 1 }, { roomRevision = 1, sequence = 5 }))

assert_false("revision_gate: stale revision dropped",
  packet.passes_revision_gate({ roomRevision = 0, sequence = 99 }, { roomRevision = 1, sequence = 1 }))

assert_false("revision_gate: same revision, stale sequence dropped",
  packet.passes_revision_gate({ roomRevision = 1, sequence = 1 }, { roomRevision = 1, sequence = 5 }))

assert_true("revision_gate: same revision, newer sequence accepted",
  packet.passes_revision_gate({ roomRevision = 1, sequence = 6 }, { roomRevision = 1, sequence = 5 }))

-- --- accept (full pipeline) tests ---

local good_raw = '{"roomRevision":1,"sequence":1,"seal":"plan1:abc"}'
local pkt, accept_err = packet.accept(good_raw, nil)
assert_true("accept: valid first packet accepted", pkt ~= nil)

local _, stale_err = packet.accept(good_raw, { roomRevision = 2, sequence = 1, seal = "plan1:abc" })
assert_eq("accept: stale packet rejected", stale_err, "STALE_REVISION")

local mismatch_raw = '{"roomRevision":2,"sequence":2,"seal":"plan1:xyz"}'
local _, mismatch_err = packet.accept(mismatch_raw, { roomRevision = 1, sequence = 1, seal = "plan1:abc" })
assert_eq("accept: seal mismatch rejected", mismatch_err, "SEAL_MISMATCH")

-- --- summary ---

print(string.format("\npacket_test.lua: %d passed, %d failed", passed, failed))
if failed > 0 then os.exit(1) end
