import { ScholomanceGraphPacketV1, ScholomanceGraphNodeV1, ScholomanceGraphDiagnosticV1 } from './graphPacketSchema';
import { validateGraphPacket, hasFatal } from './graphDiagnostics';

export interface GraphCompileContext {
  resolvers: Map<string, GraphNodeResolver>;
}

export interface GraphCompileResult {
  ok: boolean;
  diagnostics: ScholomanceGraphDiagnosticV1[];
  artifacts: any[];
}

export interface GraphNodeResolver {
  resolve(args: {
    node: ScholomanceGraphNodeV1;
    inputs: Record<string, any>;
    seed: string;
    context: GraphCompileContext;
  }): { outputs: Record<string, any>; diagnostics: ScholomanceGraphDiagnosticV1[] };
}

export interface GraphCompileState {
  seed: string;
  nodeOutputs: Map<string, Record<string, any>>;
  diagnostics: ScholomanceGraphDiagnosticV1[];
  addDiagnostic(d: ScholomanceGraphDiagnosticV1): void;
  addDiagnostics(ds: ScholomanceGraphDiagnosticV1[]): void;
}

function createGraphCompileState(options: { seed: string; nodeOutputs: Map<string, Record<string, any>> }): GraphCompileState {
  return {
    seed: options.seed,
    nodeOutputs: options.nodeOutputs,
    diagnostics: [],
    addDiagnostic(d: ScholomanceGraphDiagnosticV1) {
      this.diagnostics.push(d);
    },
    addDiagnostics(ds: ScholomanceGraphDiagnosticV1[]) {
      this.diagnostics.push(...ds);
    }
  };
}

function buildDeterministicExecutionPlan(packet: ScholomanceGraphPacketV1) {
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

  const steps: { nodeId: string }[] = [];
  const available = Array.from(inDegree.entries())
    .filter(([_, degree]) => degree === 0)
    .map(([nodeId]) => nodeId);

  available.sort(); // Deterministic tie-breaking

  while (available.length > 0) {
    const u = available.shift()!;
    steps.push({ nodeId: u });
    const neighbors = adj.get(u) || [];
    for (const v of neighbors) {
      const newDegree = inDegree.get(v)! - 1;
      inDegree.set(v, newDegree);
      if (newDegree === 0) {
        available.push(v);
      }
    }
    available.sort(); // Maintain deterministic order
  }

  return { steps };
}

function collectNodeInputs(packet: ScholomanceGraphPacketV1, state: GraphCompileState, node: ScholomanceGraphNodeV1): Record<string, any> {
  const inputs: Record<string, any> = {};
  const incomingConns = packet.connections.filter(c => c.target.nodeId === node.id);

  for (const conn of incomingConns) {
    const sourceOutputs = state.nodeOutputs.get(conn.source.nodeId);
    if (sourceOutputs) {
      inputs[conn.target.socket] = sourceOutputs[conn.source.socket];
    }
  }
  return inputs;
}

function finalizeGraphCompileResult(packet: ScholomanceGraphPacketV1, state: GraphCompileState): GraphCompileResult {
  return {
    ok: !hasFatal(state.diagnostics),
    diagnostics: state.diagnostics,
    artifacts: Array.from(state.nodeOutputs.entries()).map(([nodeId, outputs]) => ({ nodeId, outputs }))
  };
}

export function compileScholomanceGraphPacket(
  packet: ScholomanceGraphPacketV1,
  context: GraphCompileContext
): GraphCompileResult {
  const diagnostics = validateGraphPacket(packet, context);

  if (hasFatal(diagnostics)) {
    return {
      ok: false,
      diagnostics,
      artifacts: []
    };
  }

  const executionPlan = buildDeterministicExecutionPlan(packet);

  const state = createGraphCompileState({
    seed: packet.determinism.seed,
    nodeOutputs: new Map()
  });

  for (const step of executionPlan.steps) {
    const node = packet.nodes.find(n => n.id === step.nodeId);

    if (!node) {
      state.addDiagnostic({
        code: "GRAPH-003 MISSING_NODE",
        severity: "fatal",
        nodeId: step.nodeId,
        message: `Execution plan referenced missing node ${step.nodeId}`
      });
      break;
    }

    const resolver = context.resolvers.get(node.compiler.resolverId);

    if (!resolver) {
      state.addDiagnostic({
        code: "GRAPH-008 MISSING_RESOLVER",
        severity: "fatal",
        nodeId: node.id,
        message: `Missing resolver ${node.compiler.resolverId}`
      });
      break;
    }

    const inputValues = collectNodeInputs(packet, state, node);

    const result = resolver.resolve({
      node,
      inputs: inputValues,
      seed: packet.determinism.seed,
      context
    });

    state.nodeOutputs.set(node.id, result.outputs);
    state.addDiagnostics(result.diagnostics);
  }

  return finalizeGraphCompileResult(packet, state);
}
