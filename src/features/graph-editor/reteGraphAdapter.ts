/**
 * ReteGraphAdapter
 *
 * Bidirectional bridge between Rete.js editor state and the canonical
 * ScholomanceGraphPacket-v1.
 *
 * Rete is the viewport. The packet is the truth.
 */

import { NodeEditor } from 'rete';
import { ScholomanceGraphPacketV1, ScholomanceGraphNodeV1, ScholomanceGraphConnectionV1 } from './graphPacketSchema';
import { getNodeDefinition } from './nodeRegistry';

export interface ReteLayoutSnapshot {
  positions: Record<string, { x: number; y: number }>;
  sizes?: Record<string, { width: number; height: number }>;
  viewport?: { x: number; y: number; zoom: number };
}

export async function exportReteToGraphPacket(
  editor: NodeEditor<any>,
  layout: ReteLayoutSnapshot,
  options: {
    graphId: string;
    title: string;
    seed: string;
    createdBy?: 'human' | 'ai' | 'hybrid';
    domain?: string;
  }
): Promise<ScholomanceGraphPacketV1> {
  const reteNodes = editor.getNodes();
  const reteConnections = editor.getConnections();

  const nodes: ScholomanceGraphNodeV1[] = reteNodes.map((reteNode: any) => {
    const kind = reteNode.name || reteNode.label || 'unknown';
    const def = getNodeDefinition(kind);
    return {
      id: reteNode.id,
      kind: def ? def.kind : kind,
      label: reteNode.label || def?.label || 'Unnamed Node',
      inputs: def ? { ...def.inputs } : {},
      outputs: def ? { ...def.outputs } : {},
      params: reteNode.data || {},
      compiler: {
        resolverId: def?.resolverId || 'unknown',
        version: 'v1',
        pure: def?.pure ?? true,
        deterministic: def?.deterministic ?? true,
        allowAsync: false,
      },
      provenance: {
        source: 'manual',
      },
    } as ScholomanceGraphNodeV1;
  });

  const connections: ScholomanceGraphConnectionV1[] = reteConnections.map((conn: any) => {
    const sourceNode = reteNodes.find((n: any) => n.id === conn.source);
    const kind = sourceNode?.name || sourceNode?.label || 'unknown';
    const def = getNodeDefinition(kind);
    const socketType = def?.outputs?.[conn.sourceOutput]?.type || 'pixelbrain.packet';

    return {
      id: conn.id,
      source: {
        nodeId: conn.source,
        socket: conn.sourceOutput,
      },
      target: {
        nodeId: conn.target,
        socket: conn.targetInput,
      },
      type: socketType as any,
    };
  });

  const packet: ScholomanceGraphPacketV1 = {
    schemaVersion: 'scholomance.graph.v1',
    graphId: options.graphId,
    title: options.title,
    determinism: {
      seed: options.seed,
      canonicalJsonVersion: 'canonical-json.v1',
      createdBy: options.createdBy || 'human',
      compilationMode: 'shadow',
    },
    nodes,
    connections,
    uiLayout: {
      renderer: 'rete',
      version: 'rete-layout.v1',
      positions: layout.positions,
      sizes: layout.sizes,
      viewport: layout.viewport,
    },
    metadata: {
      tags: [],
      domain: (options.domain as any) || 'mixed',
      authoringSurface: 'ScholomanceReteGraphEditor',
    },
    diagnostics: [],
  };

  return packet;
}

import { createReteNodeFromDefinition } from './reteNodeFactory';
import { ClassicPreset } from 'rete';

export async function importGraphPacketToRete(
  packet: ScholomanceGraphPacketV1,
  editor: NodeEditor<any>
) {
  await editor.clear();
  const nodeMap = new Map<string, any>();

  for (const node of packet.nodes) {
    const def = getNodeDefinition(node.kind);
    if (!def) continue;
    const reteNode = createReteNodeFromDefinition(def);
    reteNode.id = node.id;
    (reteNode as any).data = { ...node.params };
    await editor.addNode(reteNode);
    nodeMap.set(node.id, reteNode);
    
    if (packet.uiLayout?.positions?.[node.id]) {
      const pos = packet.uiLayout.positions[node.id];
      const area = (editor as any).__area;
      if (area) {
        area.translate(node.id, pos);
      }
    }
  }

  for (const conn of packet.connections) {
    const source = nodeMap.get(conn.source.nodeId);
    const target = nodeMap.get(conn.target.nodeId);
    if (source && target) {
      const reteConn = new ClassicPreset.Connection(source, conn.source.socket, target, conn.target.socket);
      reteConn.id = conn.id;
      await editor.addConnection(reteConn);
    }
  }
}
