/**
 * ConnectionRegistry — tracks live connections and room subscriptions.
 *
 * Milestone 3 deliverables: "connection registry" + "room subscriptions".
 *
 * Infrastructure-agnostic: it stores a generic `send(message: string)` callback
 * per connection rather than a WebSocket object, so this package stays in the
 * adapters layer with NO transport imports (PDR §8.3 dependency law).
 *
 * Responsibilities:
 *   - map connectionId ↔ playerId (a player may have several live connections)
 *   - track which rooms each connection subscribes to
 *   - provide targeted send helpers (to a connection, to a player, to a room)
 *
 * It does NOT own world state, serialization, or persistence.
 */

export type SendFn = (message: string) => void;

export interface Connection {
  connectionId: string;
  playerId: string | null;
  send: SendFn;
  rooms: Set<string>;
}

export class ConnectionRegistry {
  private connections: Map<string, Connection> = new Map();
  private playerIndex: Map<string, Set<string>> = new Map();
  private roomIndex: Map<string, Set<string>> = new Map();

  // ─── Connection lifecycle ────────────────────────────────────────────────────

  /**
   * Register a new connection. playerId is null until `identify` is called.
   */
  addConnection(connectionId: string, send: SendFn): Connection {
    const conn: Connection = { connectionId, playerId: null, send, rooms: new Set() };
    this.connections.set(connectionId, conn);
    return conn;
  }

  /**
   * Bind a connection to a player identity (connection.identify).
   */
  identify(connectionId: string, playerId: string): Connection | undefined {
    const conn = this.connections.get(connectionId);
    if (!conn) return undefined;

    // Remove from any previous player index entry
    if (conn.playerId && conn.playerId !== playerId) {
      this.playerIndex.get(conn.playerId)?.delete(connectionId);
    }

    conn.playerId = playerId;
    if (!this.playerIndex.has(playerId)) {
      this.playerIndex.set(playerId, new Set());
    }
    this.playerIndex.get(playerId)!.add(connectionId);
    return conn;
  }

  /**
   * Remove a connection entirely. Returns the rooms it was subscribed to so the
   * caller can broadcast a departure to each.
   */
  removeConnection(connectionId: string): string[] {
    const conn = this.connections.get(connectionId);
    if (!conn) return [];

    const rooms = [...conn.rooms];
    for (const roomId of rooms) {
      this.roomIndex.get(roomId)?.delete(connectionId);
      if (this.roomIndex.get(roomId)?.size === 0) {
        this.roomIndex.delete(roomId);
      }
    }

    if (conn.playerId) {
      this.playerIndex.get(conn.playerId)?.delete(connectionId);
      if (this.playerIndex.get(conn.playerId)?.size === 0) {
        this.playerIndex.delete(conn.playerId);
      }
    }

    this.connections.delete(connectionId);
    return rooms;
  }

  // ─── Room subscriptions ──────────────────────────────────────────────────────

  subscribe(connectionId: string, roomId: string): void {
    const conn = this.connections.get(connectionId);
    if (!conn) return;
    conn.rooms.add(roomId);
    if (!this.roomIndex.has(roomId)) {
      this.roomIndex.set(roomId, new Set());
    }
    this.roomIndex.get(roomId)!.add(connectionId);
  }

  unsubscribe(connectionId: string, roomId: string): void {
    const conn = this.connections.get(connectionId);
    if (!conn) return;
    conn.rooms.delete(roomId);
    this.roomIndex.get(roomId)?.delete(connectionId);
    if (this.roomIndex.get(roomId)?.size === 0) {
      this.roomIndex.delete(roomId);
    }
  }

  getSubscribedRooms(connectionId: string): string[] {
    const conn = this.connections.get(connectionId);
    return conn ? [...conn.rooms] : [];
  }

  // ─── Lookups ─────────────────────────────────────────────────────────────────

  getConnection(connectionId: string): Connection | undefined {
    return this.connections.get(connectionId);
  }

  getPlayerId(connectionId: string): string | null {
    return this.connections.get(connectionId)?.playerId ?? null;
  }

  getConnectionsForPlayer(playerId: string): Connection[] {
    const ids = this.playerIndex.get(playerId);
    if (!ids) return [];
    return [...ids]
      .map((id) => this.connections.get(id))
      .filter((c): c is Connection => Boolean(c));
  }

  /**
   * All connections currently subscribed to a room.
   */
  getRoomSubscribers(roomId: string): Connection[] {
    const ids = this.roomIndex.get(roomId);
    if (!ids) return [];
    return [...ids]
      .map((id) => this.connections.get(id))
      .filter((c): c is Connection => Boolean(c));
  }

  // ─── Targeted send helpers ───────────────────────────────────────────────────

  sendTo(connectionId: string, message: string): void {
    this.connections.get(connectionId)?.send(message);
  }

  sendToPlayer(playerId: string, message: string): void {
    for (const conn of this.getConnectionsForPlayer(playerId)) {
      conn.send(message);
    }
  }

  /**
   * Send to every subscriber of a room, optionally excluding one connection.
   * Returns the number of connections the message was delivered to.
   */
  sendToRoom(roomId: string, message: string, excludeConnectionId?: string): number {
    let count = 0;
    for (const conn of this.getRoomSubscribers(roomId)) {
      if (excludeConnectionId && conn.connectionId === excludeConnectionId) continue;
      conn.send(message);
      count++;
    }
    return count;
  }

  get size(): number {
    return this.connections.size;
  }
}
