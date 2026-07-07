--[[
  Minimal Curing Stub for Vaelrix

  This is intentionally simple. Real curing systems for most MUDs are hundreds of lines.

  Extend this with your game's specific afflictions and balance tracking.
]]

vaelrix = vaelrix or {}
vaelrix.curing = vaelrix.curing or {}

vaelrix.curing.priorities = {
  "heal_critical",
  "cure_poison",
  "restore_balance",
}

vaelrix.curing.afflictionMap = {
  -- map incoming GMCP or trigger data to internal keys
  -- example: ["affliction_poison"] = "poison",
}

function vaelrix.curing.tick()
  -- Called periodically or from GMCP hooks
  local v = vaelrix.vitals
  if not v.hp then return end

  -- Very dumb example logic
  if v.hp < 40 then
    send("sip health")
    return true
  end

  -- Add your real logic here (balance checking, herb queue, etc.)
end

-- Example: call this from your main Vaelrix vitals hook
-- vaelrix.curing.tick()
print("Vaelrix curing stub loaded.")
