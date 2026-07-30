-- scenepacket/ws.lua — Pure-Lua RFC6455 WebSocket client over bundled LuaSocket.
--
-- Defold Bridge Design §"Components / apps/defold-runtime":
--   The WS client needs base64 and client-side frame masking. It needs NO
--   SHA-1: the server's Sec-WebSocket-Accept is not verified, consistent
--   with Lua doing no hashing.
--
-- Non-blocking: polled inside update(dt) with settimeout(0). The engine's
-- frame rate must never become an authority on world time.
--
-- ws:// only. No TLS. No HTML5 target. (Defold Bridge Design §"Decisions")

local M = {}

local socket = require("socket")

-- --- Base64 encode (for Sec-WebSocket-Key) -----------------------------------

local B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

local function base64_encode(data)
  return ((data:gsub(".", function(x)
    local r, b = "", x:byte()
    for i = 8, 1, -1 do r = r .. (b % 2^i - b % 2^(i-1) > 0 and "1" or "0") end
    return r
  end) .. "0000"):gsub("%d%d%d?%d?%d?%d?", function(x)
    if (#x < 6) then return "" end
    local c = 0
    for i = 1, 6 do c = c + (x:sub(i,i) == "1" and 2^(6-i) or 0) end
    return B64:sub(c+1, c+1)
  end) .. ({ "", "==", "=" })[#data % 3 + 1])
end

-- --- Frame codec -------------------------------------------------------------

local OP_CONT  = 0x0
local OP_TEXT  = 0x1
local OP_CLOSE = 0x8
local OP_PING  = 0x9
local OP_PONG  = 0xA

--- Build a masked client→server text frame (RFC6455 §5.3).
-- Client frames MUST be masked. Mask key is 4 random bytes.
local function encode_text_frame(payload)
  local len = #payload
  local header
  if len < 126 then
    header = string.char(0x81, 0x80 + len)  -- FIN + TEXT, MASK + len
  elseif len < 65536 then
    header = string.char(0x81, 0x80 + 126,
      math.floor(len / 256) % 256, len % 256)
  else
    -- 64-bit length (unlikely for scene packets)
    header = string.char(0x81, 0x80 + 127,
      0, 0, 0, 0,
      math.floor(len / 16777216) % 256,
      math.floor(len / 65536) % 256,
      math.floor(len / 256) % 256,
      len % 256)
  end
  -- 4-byte mask key
  local mask = string.char(
    math.random(0, 255), math.random(0, 255),
    math.random(0, 255), math.random(0, 255))
  local masked = {}
  for i = 1, len do
    masked[i] = string.char(payload:byte(i) ~ mask:byte(((i - 1) % 4) + 1))
  end
  return header .. mask .. table.concat(masked)
end

--- Decode a server→client frame (unmasked). Returns opcode, payload, bytes_consumed.
-- Returns nil, nil, 0 if the buffer is incomplete.
local function decode_frame(buf)
  if #buf < 2 then return nil, nil, 0 end
  local b1, b2 = buf:byte(1), buf:byte(2)
  local opcode = b1 % 16
  local masked = (b2 >= 128)
  local len = b2 % 128
  local offset = 3

  if len == 126 then
    if #buf < 4 then return nil, nil, 0 end
    len = buf:byte(3) * 256 + buf:byte(4)
    offset = 5
  elseif len == 127 then
    if #buf < 10 then return nil, nil, 0 end
    len = 0
    for i = 3, 10 do len = len * 256 + buf:byte(i) end
    offset = 11
  end

  local mask_key = nil
  if masked then
    if #buf < offset + 3 then return nil, nil, 0 end
    mask_key = buf:sub(offset, offset + 3)
    offset = offset + 4
  end

  if #buf < offset + len - 1 then return nil, nil, 0 end

  local payload = buf:sub(offset, offset + len - 1)
  if mask_key then
    local unmasked = {}
    for i = 1, #payload do
      unmasked[i] = string.char(payload:byte(i) ~ mask_key:byte(((i - 1) % 4) + 1))
    end
    payload = table.concat(unmasked)
  end

  return opcode, payload, offset + len - 1
end

-- --- Connection state machine ------------------------------------------------

local STATE_CLOSED     = "closed"
local STATE_CONNECTING = "connecting"
local STATE_OPEN       = "open"

M.STATE_CLOSED     = STATE_CLOSED
M.STATE_CONNECTING = STATE_CONNECTING
M.STATE_OPEN       = STATE_OPEN

--- Create a new WebSocket client.
-- @param url  "ws://host:port/path"
-- @return client table with :poll(), :send(text), :close(), .state
function M.create(url)
  local host, port, path = url:match("ws://([^:/]+):?(%d*)(/.*)")
  port = tonumber(port) or 80
  path = path or "/"

  local self = {
    state = STATE_CLOSED,
    _sock = nil,
    _host = host,
    _port = port,
    _path = path,
    _recv_buf = "",
    _on_message = nil,
    _on_open = nil,
    _on_close = nil,
    _on_error = nil,
    _reconnect_delay = 1.0,
    _reconnect_timer = 0,
    _ws_key = nil,
  }

  function self:on_message(fn) self._on_message = fn end
  function self:on_open(fn)    self._on_open = fn end
  function self:on_close(fn)   self._on_close = fn end
  function self:on_error(fn)   self._on_error = fn end

  function self:connect()
    if self.state ~= STATE_CLOSED then return end
    local sock, err = socket.tcp()
    if not sock then
      if self._on_error then self._on_error(err) end
      return
    end
    sock:settimeout(0)  -- non-blocking
    self._sock = sock
    self.state = STATE_CONNECTING
    sock:connect(self._host, self._port)
    -- Generate a random 16-byte key for the handshake
    local key_bytes = {}
    for i = 1, 16 do key_bytes[i] = string.char(math.random(0, 255)) end
    self._ws_key = base64_encode(table.concat(key_bytes))
  end

  --- Send the HTTP upgrade request (called once during CONNECTING).
  local function send_handshake()
    local req = table.concat({
      "GET " .. self._path .. " HTTP/1.1",
      "Host: " .. self._host .. ":" .. self._port,
      "Upgrade: websocket",
      "Connection: Upgrade",
      "Sec-WebSocket-Key: " .. self._ws_key,
      "Sec-WebSocket-Version: 13",
      "", "",
    }, "\r\n")
    self._sock:send(req)
  end

  --- Poll the socket. Call every frame from update(dt).
  -- @param dt  delta time (seconds)
  function self:poll(dt)
    if self.state == STATE_CLOSED then
      self._reconnect_timer = self._reconnect_timer + dt
      if self._reconnect_timer >= self._reconnect_delay then
        self._reconnect_timer = 0
        self:connect()
      end
      return
    end

    if not self._sock then return end

    if self.state == STATE_CONNECTING then
      -- Check if TCP connect completed
      local r, w, e = socket.select(nil, { self._sock }, 0)
      if #w > 0 then
        send_handshake()
        -- Read the HTTP 101 response (non-blocking, may take multiple polls)
        local chunk = self._sock:receive(4096)
        if chunk then
          self._recv_buf = self._recv_buf .. chunk
          if self._recv_buf:find("\r\n\r\n") then
            if self._recv_buf:find("101") then
              self.state = STATE_OPEN
              self._recv_buf = self._recv_buf:match("\r\n\r\n(.*)") or ""
              if self._on_open then self._on_open() end
            else
              if self._on_error then self._on_error("handshake failed") end
              self:_teardown()
            end
          end
        end
      end
      return
    end

    -- STATE_OPEN: read available bytes
    while true do
      local chunk, err = self._sock:receive(65536)
      if chunk then
        self._recv_buf = self._recv_buf .. chunk
      else
        break
      end
    end

    -- Process complete frames
    while #self._recv_buf > 0 do
      local opcode, payload, consumed = decode_frame(self._recv_buf)
      if consumed == 0 then break end
      self._recv_buf = self._recv_buf:sub(consumed + 1)

      if opcode == OP_TEXT then
        if self._on_message then self._on_message(payload) end
      elseif opcode == OP_PING then
        self:_send_frame(OP_PONG, payload or "")
      elseif opcode == OP_CLOSE then
        self:_send_frame(OP_CLOSE, "")
        self:_teardown()
        return
      end
    end
  end

  function self:_send_frame(opcode, payload)
    if self.state ~= STATE_OPEN or not self._sock then return end
    -- For simplicity, only text frames use the full encoder;
    -- control frames are short and use inline encoding.
    if opcode == OP_TEXT then
      self._sock:send(encode_text_frame(payload))
    else
      local len = #payload
      local frame = string.char(0x80 + opcode, 0x80 + len)
      local mask = string.char(
        math.random(0,255), math.random(0,255),
        math.random(0,255), math.random(0,255))
      local masked = {}
      for i = 1, len do
        masked[i] = string.char(payload:byte(i) ~ mask:byte(((i-1)%4)+1))
      end
      self._sock:send(frame .. mask .. table.concat(masked))
    end
  end

  --- Send a text message. No-op unless OPEN.
  function self:send(text)
    self:_send_frame(OP_TEXT, text)
  end

  function self:_teardown()
    if self._sock then
      self._sock:close()
      self._sock = nil
    end
    self.state = STATE_CLOSED
    self._recv_buf = ""
    if self._on_close then self._on_close() end
  end

  function self:close()
    if self.state == STATE_OPEN then
      self:_send_frame(OP_CLOSE, "")
    end
    self:_teardown()
  end

  return self
end

return M
