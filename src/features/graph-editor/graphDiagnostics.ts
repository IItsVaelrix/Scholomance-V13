import { ScholomanceGraphPacketV1, ScholomanceGraphDiagnosticV1 } from './graphPacketSchema';

export function hasFatal(diagnostics: ScholomanceGraphDiagnosticV1[]): boolean {
  return diagnostics.some(d => d.severity === "fatal");
}

export function validateGraphPacket(packet: ScholomanceGraphPacketV1, context?: any): ScholomanceGraphDiagnosticV1[] {
  const diagnostics: ScholomanceGraphDiagnosticV1[] = [];

  const nodeIds = new Set<string>();
  for (const node of packet.nodes) {
    if (nodeIds.has(node.id)) {
      diagnostics.push({
        code: "GRAPH-001 DUPLICATE_NODE_ID",
        severity: "fatal",
        nodeId: node.id,
        message: `Duplicate node ID: ${node.id}`
      });
    }
    nodeIds.add(node.id);
  }

  const connIds = new Set<string>();
  for (const conn of packet.connections) {
    if (connIds.has(conn.id)) {
      diagnostics.push({
        code: "GRAPH-002 DUPLICATE_CONNECTION_ID",
        severity: "fatal",
        connectionId: conn.id,
        message: `Duplicate connection ID: ${conn.id}`
      });
    }
    connIds.add(conn.id);
  }

  for (const conn of packet.connections) {
    const sourceNode = packet.nodes.find(n => n.id === conn.source.nodeId);
    const targetNode = packet.nodes.find(n => n.id === conn.target.nodeId);

    if (!sourceNode) {
      diagnostics.push({
        code: "GRAPH-003 MISSING_NODE",
        severity: "fatal",
        connectionId: conn.id,
        nodeId: conn.source.nodeId,
        message: `Source node ${conn.source.nodeId} missing for connection ${conn.id}`
      });
    } else {
      if (!sourceNode.outputs || !sourceNode.outputs[conn.source.socket]) {
        diagnostics.push({
          code: "GRAPH-004 INVALID_SOCKET_TYPE",
          severity: "fatal",
          connectionId: conn.id,
          nodeId: sourceNode.id,
          message: `Source socket ${conn.source.socket} missing on node ${sourceNode.id}`
        });
      }
    }

    if (!targetNode) {
      diagnostics.push({
        code: "GRAPH-003 MISSING_NODE",
        severity: "fatal",
        connectionId: conn.id,
        nodeId: conn.target.nodeId,
        message: `Target node ${conn.target.nodeId} missing for connection ${conn.id}`
      });
    } else {
      if (!targetNode.inputs || !targetNode.inputs[conn.target.socket]) {
        diagnostics.push({
          code: "GRAPH-004 INVALID_SOCKET_TYPE",
          severity: "fatal",
          connectionId: conn.id,
          nodeId: targetNode.id,
          message: `Target socket ${conn.target.socket} missing on node ${targetNode.id}`
        });
      }
    }
  }

  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const node of packet.nodes) {
    adj.set(node.id, []);
    inDegree.set(node.id, 0);
  }

  for (const conn of packet.connections) {
    if (adj.has(conn.source.nodeId) && inDegree.has(conn.target.nodeId)) {
      adj.get(conn.source.nodeId)!.push(conn.target.nodeId);
      inDegree.set(conn.target.nodeId, inDegree.get(conn.target.nodeId)! + 1);
    }
  }

  const queue: string[] = [];
  for (const [nodeId, degree] of Array.from(inDegree.entries())) {
    if (degree === 0) {
      queue.push(nodeId);
    }
  }

  let visitedCount = 0;
  while (queue.length > 0) {
    const u = queue.shift()!;
    visitedCount++;
    const neighbors = adj.get(u) || [];
    for (const v of neighbors) {
      inDegree.set(v, inDegree.get(v)! - 1);
      if (inDegree.get(v) === 0) {
        queue.push(v);
      }
    }
  }

  if (visitedCount < packet.nodes.length) {
    diagnostics.push({
      code: "GRAPH-006 CYCLE_NOT_ALLOWED",
      severity: "fatal",
      message: "Graph contains a cycle"
    });
  }

  return diagnostics;
}
