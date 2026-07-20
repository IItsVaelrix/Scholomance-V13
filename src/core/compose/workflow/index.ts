/**
 * Workflow Layer - XState integration
 * 
 * Hierarchical statecharts, actors, and event-driven orchestration
 * for application workflows. This handles cross-component coordination
 * and multi-step processes.
 * 
 * @module compose/workflow
 */

/**
 * Workflow event - an event in the workflow state machine
 */
export type WorkflowEvent = {
  type: string;
  payload?: Record<string, unknown>;
};

/**
 * Workflow context - shared data across the workflow
 */
export type WorkflowContext = Record<string, unknown>;

/**
 * Workflow state - current state of the workflow
 */
export type WorkflowState = {
  /** Current state value (can be hierarchical) */
  value: string | Record<string, string>;
  /** Workflow context data */
  context: WorkflowContext;
  /** Active child states (for parallel states) */
  children?: Record<string, WorkflowState>;
};

/**
 * Workflow action - side effect to execute during transitions
 */
export type WorkflowAction = 
  | { type: 'assign'; assign: (ctx: WorkflowContext, event: WorkflowEvent) => Partial<WorkflowContext> }
  | { type: 'send'; event: WorkflowEvent; to?: string }
  | { type: 'raise'; event: WorkflowEvent }
  | { type: 'log'; expr: (ctx: WorkflowContext, event: WorkflowEvent) => string }
  | { type: 'invoke'; src: string; id?: string };

/**
 * Workflow guard - condition that must be true for a transition
 */
export type WorkflowGuard = (ctx: WorkflowContext, event: WorkflowEvent) => boolean;

/**
 * Workflow transition - defines how the workflow changes state
 */
export type WorkflowTransition = {
  /** Event that triggers this transition */
  event: string;
  /** Target state */
  target?: string;
  /** Guard condition */
  cond?: WorkflowGuard;
  /** Actions to execute */
  actions?: WorkflowAction[];
  /** Internal transition (doesn't exit/re-enter state) */
  internal?: boolean;
};

/**
 * Workflow state node - a state in the workflow
 */
export type WorkflowStateNode = {
  /** State identifier */
  id: string;
  /** Initial child state (for compound states) */
  initial?: string;
  /** Child states */
  states?: Record<string, WorkflowStateNode>;
  /** Transitions from this state */
  on?: Record<string, WorkflowTransition | WorkflowTransition[]>;
  /** Entry actions */
  entry?: WorkflowAction[];
  /** Exit actions */
  exit?: WorkflowAction[];
  /** Invoked services */
  invoke?: Array<{
    src: string;
    id?: string;
    onDone?: WorkflowTransition;
    onError?: WorkflowTransition;
  }>;
  /** Whether this is a final state */
  type?: 'final';
};

/**
 * Workflow machine - complete workflow definition
 */
export type WorkflowMachine = {
  /** Unique identifier */
  id: string;
  /** Initial state */
  initial: string;
  /** Initial context */
  context?: WorkflowContext;
  /** State definitions */
  states: Record<string, WorkflowStateNode>;
};

/**
 * Workflow service - runtime instance of a workflow machine
 */
export class WorkflowService {
  private machine: WorkflowMachine;
  private state: WorkflowState;
  private listeners: Array<(state: WorkflowState) => void> = [];
  private stopped = false;

  constructor(machine: WorkflowMachine) {
    this.machine = machine;
    this.state = {
      value: machine.initial,
      context: machine.context || {}
    };
  }

  /**
   * Get current state
   */
  getState(): WorkflowState {
    return { ...this.state };
  }

  /**
   * Send an event to the workflow
   */
  send(event: WorkflowEvent): void {
    if (this.stopped) return;

    const currentState = this.getCurrentStateNode();
    if (!currentState || !currentState.on) return;

    const transitions = currentState.on[event.type];
    if (!transitions) return;

    const transitionList = Array.isArray(transitions) ? transitions : [transitions];
    
    for (const transition of transitionList) {
      // Check guard
      if (transition.cond && !transition.cond(this.state.context, event)) {
        continue;
      }

      // Execute actions
      if (transition.actions) {
        for (const action of transition.actions) {
          this.executeAction(action, event);
        }
      }

      // Transition to new state
      if (transition.target) {
        this.state.value = transition.target;
        
        // Notify listeners
        for (const listener of this.listeners) {
          listener(this.getState());
        }
      }

      break;
    }
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: (state: WorkflowState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Start the workflow
   */
  start(): void {
    this.stopped = false;
    const currentState = this.getCurrentStateNode();
    if (currentState?.entry) {
      for (const action of currentState.entry) {
        this.executeAction(action, { type: 'entry' });
      }
    }
  }

  /**
   * Stop the workflow
   */
  stop(): void {
    this.stopped = true;
    this.listeners = [];
  }

  /**
   * Get the current state node
   */
  private getCurrentStateNode(): WorkflowStateNode | undefined {
    const stateValue = typeof this.state.value === 'string' 
      ? this.state.value 
      : Object.values(this.state.value)[0];
    return this.machine.states[stateValue];
  }

  /**
   * Execute a workflow action
   */
  private executeAction(action: WorkflowAction, event: WorkflowEvent): void {
    switch (action.type) {
      case 'assign':
        const updates = action.assign(this.state.context, event);
        this.state.context = { ...this.state.context, ...updates };
        break;
      case 'send':
        // In a real implementation, this would send to another actor
        console.log('[Workflow] Send event:', action.event, 'to:', action.to);
        break;
      case 'raise':
        // Re-queue the event
        setTimeout(() => this.send(action.event), 0);
        break;
      case 'log':
        console.log('[Workflow]', action.expr(this.state.context, event));
        break;
      case 'invoke':
        // In a real implementation, this would start a service
        console.log('[Workflow] Invoke service:', action.src);
        break;
    }
  }
}

/**
 * Create a navigation workflow
 */
export function createNavigationWorkflow(): WorkflowMachine {
  return {
    id: 'navigation',
    initial: 'idle',
    context: {
      currentRoute: '/',
      history: [],
      params: {}
    },
    states: {
      idle: {
        on: {
          NAVIGATE: {
            target: 'navigating',
            actions: [
              {
                type: 'assign',
                assign: (ctx, event) => ({
                  history: [...(ctx.history as string[]), ctx.currentRoute as string],
                  currentRoute: event.payload?.route as string,
                  params: event.payload?.params || {}
                })
              }
            ]
          }
        }
      },
      navigating: {
        on: {
          NAVIGATE_COMPLETE: {
            target: 'idle'
          },
          NAVIGATE_ERROR: {
            target: 'error'
          }
        }
      },
      error: {
        on: {
          RETRY: {
            target: 'navigating'
          },
          CANCEL: {
            target: 'idle'
          }
        }
      }
    }
  };
}

/**
 * Create a form submission workflow
 */
export function createFormWorkflow(): WorkflowMachine {
  return {
    id: 'form',
    initial: 'editing',
    context: {
      values: {},
      errors: {},
      submitting: false
    },
    states: {
      editing: {
        on: {
          SUBMIT: {
            target: 'validating',
            actions: [
              {
                type: 'assign',
                assign: () => ({ submitting: true })
              }
            ]
          },
          CHANGE: {
            actions: [
              {
                type: 'assign',
                assign: (ctx, event) => ({
                  values: { ...ctx.values, ...event.payload }
                })
              }
            ]
          }
        }
      },
      validating: {
        on: {
          VALID: {
            target: 'submitting'
          },
          INVALID: {
            target: 'editing',
            actions: [
              {
                type: 'assign',
                assign: (ctx, event) => ({
                  errors: event.payload?.errors || {},
                  submitting: false
                })
              }
            ]
          }
        }
      },
      submitting: {
        on: {
          SUCCESS: {
            target: 'success'
          },
          ERROR: {
            target: 'editing',
            actions: [
              {
                type: 'assign',
                assign: () => ({ submitting: false })
              }
            ]
          }
        }
      },
      success: {
        type: 'final'
      }
    }
  };
}

/**
 * Create a workflow service
 */
export function createWorkflowService(machine: WorkflowMachine): WorkflowService {
  return new WorkflowService(machine);
}
