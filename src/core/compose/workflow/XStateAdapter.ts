/**
 * XState Adapter - Bridge between custom WorkflowService and real XState
 * 
 * This adapter converts WorkflowMachine definitions to XState machines
 * and provides behavioral equivalence testing.
 * 
 * @module compose/workflow/XStateAdapter
 */

import { createMachine, assign, createActor } from 'xstate';
import type { WorkflowMachine, WorkflowState, WorkflowEvent, WorkflowContext } from './index';
import { WorkflowService } from './index';

/**
 * Equivalence log entry
 */
export type EquivalenceLogEntry = {
  timestamp: number;
  event: WorkflowEvent;
  customState: WorkflowState;
  xstateState: unknown;
  match: boolean;
  delta?: string;
};

/**
 * XState Adapter - bridges custom workflow to real XState
 */
export class XStateAdapter {
  private customService: WorkflowService;
  private xstateMachine: ReturnType<typeof createMachine>;
  private xstateActor: ReturnType<typeof createActor>;
  private equivalenceLog: EquivalenceLogEntry[] = [];
  private useXState: boolean;

  constructor(workflowMachine: WorkflowMachine, useXState = true) {
    this.useXState = useXState;
    this.customService = new WorkflowService(workflowMachine);
    
    if (useXState) {
      // Convert WorkflowMachine to XState machine
      this.xstateMachine = this.convertToXState(workflowMachine);
      this.xstateActor = createActor(this.xstateMachine);
      this.xstateActor.start();
    }
  }

  /**
   * Convert WorkflowMachine to XState machine definition
   */
  private convertToXState(workflow: WorkflowMachine): ReturnType<typeof createMachine> {
    const convertState = (stateNode: any): any => {
      const result: any = {};

      if (stateNode.initial) {
        result.initial = stateNode.initial;
      }

      if (stateNode.states) {
        result.states = {};
        for (const [name, child] of Object.entries(stateNode.states)) {
          result.states[name] = convertState(child);
        }
      }

      if (stateNode.on) {
        result.on = {};
        for (const [event, transition] of Object.entries(stateNode.on)) {
          const transitions = Array.isArray(transition) ? transition : [transition];
          result.on[event] = transitions.map((t: any) => {
            const xstateTransition: any = {};
            
            if (t.target) {
              xstateTransition.target = t.target;
            }

            if (t.cond) {
              // Wrap custom guard for XState v5
              const customGuard = t.cond;
              xstateTransition.guard = ({ context, event: xstateEvent }) => {
                const customEvent = { type: xstateEvent.type, payload: xstateEvent };
                return customGuard(context, customEvent);
              };
            }

            if (t.actions) {
              xstateTransition.actions = t.actions.map((action: any) => {
                if (action.type === 'assign') {
                  // Wrap custom assign function for XState v5
                  // Custom: (ctx, event) => Partial<ctx> where event has .payload
                  // XState v5: ({ context, event }) => Partial<ctx> where event is spread
                  const customAssignFn = action.assign;
                  return assign(({ context, event: xstateEvent }) => {
                    // Reconstruct custom event format with payload
                    const customEvent = { 
                      type: xstateEvent.type, 
                      payload: xstateEvent 
                    };
                    return customAssignFn(context, customEvent);
                  });
                }
                return action;
              });
            }

            return xstateTransition;
          });
        }
      }

      if (stateNode.type === 'final') {
        result.type = 'final';
      }

      return result;
    };

    const machineDef = {
      id: workflow.id,
      initial: workflow.initial,
      context: workflow.context || {},
      states: {}
    };

    for (const [name, state] of Object.entries(workflow.states)) {
      machineDef.states[name] = convertState(state);
    }

    return createMachine(machineDef);
  }

  /**
   * Send an event to the workflow
   */
  send(event: WorkflowEvent): void {
    // Send to custom service
    this.customService.send(event);

    if (this.useXState) {
      // Send to XState
      this.xstateActor.send({ type: event.type, ...event.payload });

      // Log equivalence
      this.logEquivalence(event);
    }
  }

  /**
   * Get current state from custom service
   */
  getCustomState(): WorkflowState {
    return this.customService.getState();
  }

  /**
   * Get current state from XState
   */
  getXStateState(): unknown {
    if (!this.useXState) return null;
    return this.xstateActor.getSnapshot();
  }

  /**
   * Log behavioral equivalence between custom and XState
   */
  private logEquivalence(event: WorkflowEvent): void {
    const customState = this.getCustomState();
    const xstateState = this.getXStateState() as any;

    // Compare state values - normalize both to string representation
    const customValue = typeof customState.value === 'string' 
      ? customState.value 
      : JSON.stringify(customState.value);
    
    // XState can return string or object for hierarchical states
    let xstateValue: string;
    if (typeof xstateState?.value === 'string') {
      xstateValue = xstateState.value;
    } else if (xstateState?.value) {
      xstateValue = JSON.stringify(xstateState.value);
    } else {
      xstateValue = 'unknown';
    }

    // Check if states match (allowing for different representations)
    const match = customValue === xstateValue || 
                  this.statesEquivalent(customState.value, xstateState?.value);

    this.equivalenceLog.push({
      timestamp: Date.now(),
      event,
      customState,
      xstateState,
      match,
      delta: match ? undefined : `Custom: ${customValue}, XState: ${xstateValue}`
    });
  }

  /**
   * Check if two state values are equivalent (handling different representations)
   */
  private statesEquivalent(custom: string | Record<string, string>, xstate: unknown): boolean {
    if (typeof custom === 'string' && typeof xstate === 'string') {
      return custom === xstate;
    }
    
    // For hierarchical states, compare the structure
    if (typeof custom === 'object' && typeof xstate === 'object' && xstate !== null) {
      return JSON.stringify(custom) === JSON.stringify(xstate);
    }
    
    return false;
  }

  /**
   * Get equivalence log
   */
  getEquivalenceLog(): EquivalenceLogEntry[] {
    return [...this.equivalenceLog];
  }

  /**
   * Get equivalence stats
   */
  getEquivalenceStats(): { total: number; matches: number; mismatches: number; matchRate: number } {
    const total = this.equivalenceLog.length;
    const matches = this.equivalenceLog.filter(e => e.match).length;
    const mismatches = total - matches;
    const matchRate = total > 0 ? (matches / total) * 100 : 0;

    return { total, matches, mismatches, matchRate };
  }

  /**
   * Stop the workflow
   */
  stop(): void {
    this.customService.stop();
    if (this.useXState) {
      this.xstateActor.stop();
    }
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: (state: WorkflowState) => void): () => void {
    return this.customService.subscribe(listener);
  }
}

/**
 * Create an XState adapter
 */
export function createXStateAdapter(
  workflowMachine: WorkflowMachine,
  useXState = true
): XStateAdapter {
  return new XStateAdapter(workflowMachine, useXState);
}
