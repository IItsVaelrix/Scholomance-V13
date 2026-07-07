/**
 * createReteEditor
 *
 * Minimal factory for a Rete.js NodeEditor using React renderer.
 * This is the interactive canvas only.
 */

import { NodeEditor, GetSchemes, ClassicPreset } from 'rete';
import { AreaPlugin } from 'rete-area-plugin';
import { ConnectionPlugin, Presets as ConnectionPresets } from 'rete-connection-plugin';
import { ReactPlugin, Presets as ReactPresets, ReactArea2D } from 'rete-react-plugin';
import { createRoot } from 'react-dom/client';
import { canConnect } from './reteSocketRegistry';

type Schemes = GetSchemes<
  ClassicPreset.Node,
  ClassicPreset.Connection<ClassicPreset.Node, ClassicPreset.Node>
>;
type AreaExtra = ReactArea2D<Schemes>;

export function createReteEditor(container: HTMLElement) {
  const editor = new NodeEditor<Schemes>();
  const area = new AreaPlugin<Schemes, AreaExtra>(container);
  
  const connection = new ConnectionPlugin<Schemes, AreaExtra>();
  connection.addPreset(ConnectionPresets.classic.setup());

  const render = new ReactPlugin<Schemes, AreaExtra>({ createRoot });

  editor.use(area);
  area.use(connection);
  area.use(render);

  // Basic connection validation stub (real validation in pipes)
  connection.addPipe((context: any) => {
    if (context.type === 'connectioncreate') {
      const sourceSocket = context.data.sourceOutput;
      const targetSocket = context.data.targetInput;
      // In Rete v2, we need to inspect the sockets attached to the nodes.
      // But we can just use the socket name if we gave it the right name when creating it.
      const sourceNode = editor.getNode(context.data.source);
      const targetNode = editor.getNode(context.data.target);
      if (sourceNode && targetNode) {
        const outSocket = (sourceNode as any).outputs[context.data.sourceOutput]?.socket;
        const inSocket = (targetNode as any).inputs[context.data.targetInput]?.socket;
        if (outSocket && inSocket) {
          if (!canConnect(outSocket.name, inSocket.name)) {
            console.warn(`Cannot connect ${outSocket.name} to ${inSocket.name}`);
            return false; // block connection
          }
        }
      }
    }
    return context;
  });

  // Render preset
  render.addPreset(ReactPresets.classic.setup());

  // Expose for adapter
  (editor as any).__area = area;

  return editor;
}
