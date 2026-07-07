/**
 * reteSocketRegistry.ts
 *
 * Maps Scholomance canonical socket types to Rete sockets.
 * Enforces typed connections only.
 */

export const SOCKET_COMPATIBILITY: Record<string, string[]> = {
  'formula.curve': ['formula.curve', 'formula.stroke'],
  'formula.stroke': ['formula.stroke', 'pixelbrain.packet'],
  'math.scalar': ['math.scalar', 'math.vector2'],
  'pixelbrain.packet': ['pixelbrain.packet', 'export.artifact'],
  // add more as nodes are registered
};

export function canConnect(sourceType: string, targetType: string): boolean {
  if (sourceType === targetType) return true;
  const allowed = SOCKET_COMPATIBILITY[sourceType] || [];
  return allowed.includes(targetType);
}

import { ClassicPreset } from 'rete';

const socketCache = new Map<string, ClassicPreset.Socket>();

export function getReteSocket(type: string): ClassicPreset.Socket {
  if (!socketCache.has(type)) {
    socketCache.set(type, new ClassicPreset.Socket(type));
  }
  return socketCache.get(type)!;
}
