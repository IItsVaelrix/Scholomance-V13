import { createSpeculativeContextPacket } from './speculative-context-packet.js';

export class SpeculativeContextBuffer {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 100;
    this.packets = [];
  }

  stage(matchData, observationQuantized) {
    if (this.packets.length >= this.maxSize) {
      this.packets.shift();
    }
    const packet = createSpeculativeContextPacket({
      id: matchData.id || `spec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      cellId: matchData.cellId,
      anomalyKind: matchData.anomalyKind,
      similarity: matchData.similarity,
      drift: matchData.drift,
      vector: observationQuantized,
    });
    this.packets.push(packet);
    return packet;
  }
  
  flush() {
    const out = [...this.packets];
    this.packets = [];
    return out;
  }
  
  get length() {
    return this.packets.length;
  }
  
  clear() {
    this.packets = [];
  }
}
