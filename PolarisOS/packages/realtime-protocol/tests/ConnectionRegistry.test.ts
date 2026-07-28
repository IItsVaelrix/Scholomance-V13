/**
 * ConnectionRegistry unit tests — Milestone 3 (connection registry + room subscriptions).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ConnectionRegistry } from "../src/index.js";

function makeRecorder() {
  const sent: string[] = [];
  return { sent, send: (m: string) => sent.push(m) };
}

describe("ConnectionRegistry", () => {
  let reg: ConnectionRegistry;

  beforeEach(() => {
    reg = new ConnectionRegistry();
  });

  it("registers a connection and binds a player identity", () => {
    const r = makeRecorder();
    reg.addConnection("c1", r.send);
    expect(reg.getPlayerId("c1")).toBeNull();

    reg.identify("c1", "alice");
    expect(reg.getPlayerId("c1")).toBe("alice");
    expect(reg.getConnectionsForPlayer("alice").map((c) => c.connectionId)).toEqual(["c1"]);
  });

  it("tracks room subscriptions and targets room broadcasts", () => {
    const a = makeRecorder();
    const b = makeRecorder();
    const c = makeRecorder();
    reg.addConnection("a", a.send);
    reg.addConnection("b", b.send);
    reg.addConnection("c", c.send);

    reg.subscribe("a", "shrine");
    reg.subscribe("b", "shrine");
    reg.subscribe("c", "forest");

    expect(reg.getRoomSubscribers("shrine").map((x) => x.connectionId).sort()).toEqual(["a", "b"]);

    const delivered = reg.sendToRoom("shrine", "hello");
    expect(delivered).toBe(2);
    expect(a.sent).toEqual(["hello"]);
    expect(b.sent).toEqual(["hello"]);
    expect(c.sent).toEqual([]);
  });

  it("can exclude a connection from a room broadcast", () => {
    const a = makeRecorder();
    const b = makeRecorder();
    reg.addConnection("a", a.send);
    reg.addConnection("b", b.send);
    reg.subscribe("a", "shrine");
    reg.subscribe("b", "shrine");

    reg.sendToRoom("shrine", "msg", "a");
    expect(a.sent).toEqual([]);
    expect(b.sent).toEqual(["msg"]);
  });

  it("supports multiple concurrent connections for one player", () => {
    const a = makeRecorder();
    const b = makeRecorder();
    reg.addConnection("a", a.send);
    reg.addConnection("b", b.send);
    reg.identify("a", "alice");
    reg.identify("b", "alice");

    expect(reg.getConnectionsForPlayer("alice")).toHaveLength(2);
    reg.sendToPlayer("alice", "ping");
    expect(a.sent).toEqual(["ping"]);
    expect(b.sent).toEqual(["ping"]);
  });

  it("removeConnection cleans indexes and returns subscribed rooms", () => {
    const a = makeRecorder();
    reg.addConnection("a", a.send);
    reg.identify("a", "alice");
    reg.subscribe("a", "shrine");
    reg.subscribe("a", "forest");

    const rooms = reg.removeConnection("a");
    expect(rooms.sort()).toEqual(["forest", "shrine"]);
    expect(reg.getRoomSubscribers("shrine")).toEqual([]);
    expect(reg.getConnectionsForPlayer("alice")).toEqual([]);
    expect(reg.size).toBe(0);
  });

  it("unsubscribe removes a single room only", () => {
    const a = makeRecorder();
    reg.addConnection("a", a.send);
    reg.subscribe("a", "shrine");
    reg.subscribe("a", "forest");

    reg.unsubscribe("a", "shrine");
    expect(reg.getSubscribedRooms("a")).toEqual(["forest"]);
    expect(reg.getRoomSubscribers("shrine")).toEqual([]);
  });
});
