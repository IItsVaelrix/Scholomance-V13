extends Node
class_name CombatBridge

const Contracts := preload("res://scripts/Combat/Bridge/CombatContracts.gd")

signal state_patch_received(packet: Dictionary)
signal init_received(packet: Dictionary)
signal action_received(packet: Dictionary)
signal command_ack_received(packet: Dictionary)
signal bridge_error_received(packet: Dictionary)

@export var relay_url := "ws://127.0.0.1:3001"

var socket := WebSocketPeer.new()
var reconnect_seconds := 1.0
var reconnect_timer := 0.0
var was_open := false

func _ready() -> void:
    _connect()

func _process(delta: float) -> void:
    socket.poll()

    var state := socket.get_ready_state()

    if state == WebSocketPeer.STATE_OPEN:
        if not was_open:
            was_open = true
            send_hello()

        while socket.get_available_packet_count() > 0:
            var raw := socket.get_packet().get_string_from_utf8()
            _handle_raw_packet(raw)

    elif state == WebSocketPeer.STATE_CLOSED:
        was_open = false
        reconnect_timer += delta
        if reconnect_timer >= reconnect_seconds:
            reconnect_timer = 0.0
            _connect()

func _connect() -> void:
    socket = WebSocketPeer.new()
    var err := socket.connect_to_url(relay_url)
    if err != OK:
        bridge_error_received.emit({
            "type": "BRIDGE_ERROR",
            "code": "CONNECT_FAILED",
            "error": err,
        })

func _send(packet: Dictionary) -> void:
    if socket.get_ready_state() != WebSocketPeer.STATE_OPEN:
        return

    socket.send_text(JSON.stringify(packet))

func send_hello() -> void:
    _send({
        "type": "HELLO",
        "role": "client",
    })

func send_command(command_text: String, source := "godot_terminal") -> void:
    _send({
        "type": Contracts.TYPE_COMMAND,
        "source": source,
        "command": command_text,
    })

func _handle_raw_packet(raw: String) -> void:
    var parsed = JSON.parse_string(raw)

    if typeof(parsed) != TYPE_DICTIONARY:
        bridge_error_received.emit({
            "type": "BRIDGE_ERROR",
            "code": "INVALID_JSON",
            "raw": raw,
        })
        return

    match parsed.get("type", ""):
        "CLIENT_ACCEPTED":
            pass # handled via was_open
        "COMBAT_INIT":
            init_received.emit(parsed)
        "COMBAT_ACTION":
            action_received.emit(parsed)
        Contracts.TYPE_STATE_PATCH:
            state_patch_received.emit(parsed)
        "BRIDGE_ERROR":
            bridge_error_received.emit(parsed)
        _:
            pass
