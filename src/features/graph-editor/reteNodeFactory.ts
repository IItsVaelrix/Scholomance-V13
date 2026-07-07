import { ClassicPreset } from 'rete';
import { ScholomanceGraphNodeDefinition } from './graphPacketSchema';
import { getReteSocket } from './reteSocketRegistry';

/**
 * A generic Rete Node that adapts a ScholomanceGraphNodeDefinition.
 */
export class ScholomanceReteNode extends ClassicPreset.Node {
  public kind: string;

  constructor(def: ScholomanceGraphNodeDefinition) {
    super(def.label);
    this.kind = def.kind;

    // Use default dimensions from registry, though Rete handles rendering dynamically sometimes
    (this as any).width = def.ui.defaultWidth || 180;
    (this as any).height = def.ui.defaultHeight || 120;

    // Add inputs
    if (def.inputs) {
      for (const [key, inputDef] of Object.entries(def.inputs)) {
        const socket = getReteSocket((inputDef as any).type);
        const input = new ClassicPreset.Input(socket, key);
        this.addInput(key, input);
      }
    }

    // Add outputs
    if (def.outputs) {
      for (const [key, outputDef] of Object.entries(def.outputs)) {
        const socket = getReteSocket((outputDef as any).type);
        const output = new ClassicPreset.Output(socket, key);
        this.addOutput(key, output);
      }
    }
    
    // Can also add params as Rete Controls if needed
    // this.addControl('paramName', new ClassicPreset.InputControl('text', { initial: '' }));
  }
}

/**
 * Creates a Rete node instance from a node definition.
 */
export function createReteNodeFromDefinition(def: ScholomanceGraphNodeDefinition): ScholomanceReteNode {
  return new ScholomanceReteNode(def);
}
