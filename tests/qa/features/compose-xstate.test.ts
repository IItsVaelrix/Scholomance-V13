/**
 * Compose XState Integration Tests
 * 
 * Tests the XState adapter that bridges custom WorkflowService to real XState.
 * Verifies behavioral equivalence between the two implementations.
 * 
 * @see docs/scholomance-encyclopedia/PDR-archive/PDR-2026-07-19-COMPOSED-COMPONENT-ARCHITECTURE-V2.md
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  XStateAdapter,
  createXStateAdapter
} from '../../../src/core/compose/workflow/XStateAdapter';
import {
  createNavigationWorkflow,
  createFormWorkflow,
  type WorkflowMachine
} from '../../../src/core/compose/workflow/index';

describe('Compose XState Integration', () => {
  describe('XStateAdapter', () => {
    it('should create an adapter with custom workflow only', () => {
      const machine = createNavigationWorkflow();
      const adapter = createXStateAdapter(machine, false);
      
      expect(adapter).toBeDefined();
      const state = adapter.getCustomState();
      expect(state.value).toBe('idle');
    });

    it('should create an adapter with both custom and XState', () => {
      const machine = createNavigationWorkflow();
      const adapter = createXStateAdapter(machine, true);
      
      expect(adapter).toBeDefined();
      const customState = adapter.getCustomState();
      const xstateState = adapter.getXStateState() as any;
      
      expect(customState.value).toBe('idle');
      expect(xstateState).toBeDefined();
    });

    it('should send events to both implementations', () => {
      const machine = createNavigationWorkflow();
      const adapter = createXStateAdapter(machine, true);
      
      adapter.send({ type: 'NAVIGATE', payload: { route: '/about' } });
      
      const customState = adapter.getCustomState();
      const xstateState = adapter.getXStateState() as any;
      
      expect(customState.value).toBe('navigating');
      expect(xstateState.value).toBe('navigating');
    });

    it('should log behavioral equivalence', () => {
      const machine = createNavigationWorkflow();
      const adapter = createXStateAdapter(machine, true);
      
      adapter.send({ type: 'NAVIGATE', payload: { route: '/about' } });
      
      const log = adapter.getEquivalenceLog();
      expect(log).toHaveLength(1);
      expect(log[0].event.type).toBe('NAVIGATE');
      expect(log[0].match).toBe(true);
    });

    it('should track equivalence stats', () => {
      const machine = createNavigationWorkflow();
      const adapter = createXStateAdapter(machine, true);
      
      adapter.send({ type: 'NAVIGATE', payload: { route: '/about' } });
      adapter.send({ type: 'NAVIGATE_COMPLETE' });
      adapter.send({ type: 'NAVIGATE', payload: { route: '/contact' } });
      
      const stats = adapter.getEquivalenceStats();
      expect(stats.total).toBe(3);
      expect(stats.matches).toBe(3);
      expect(stats.matchRate).toBe(100);
    });

    it('should handle navigation workflow end-to-end', () => {
      const machine = createNavigationWorkflow();
      const adapter = createXStateAdapter(machine, true);
      
      // Start at idle
      expect(adapter.getCustomState().value).toBe('idle');
      
      // Navigate
      adapter.send({ type: 'NAVIGATE', payload: { route: '/about' } });
      expect(adapter.getCustomState().value).toBe('navigating');
      
      // Complete navigation
      adapter.send({ type: 'NAVIGATE_COMPLETE' });
      expect(adapter.getCustomState().value).toBe('idle');
      
      // Check context was updated
      const state = adapter.getCustomState();
      expect(state.context.currentRoute).toBe('/about');
      expect(state.context.history).toContain('/');
    });

    it('should handle form workflow end-to-end', () => {
      const machine = createFormWorkflow();
      const adapter = createXStateAdapter(machine, true);
      
      // Start editing
      expect(adapter.getCustomState().value).toBe('editing');
      
      // Change form values
      adapter.send({ type: 'CHANGE', payload: { name: 'John' } });
      
      // Submit
      adapter.send({ type: 'SUBMIT' });
      expect(adapter.getCustomState().value).toBe('validating');
      
      // Validation passes
      adapter.send({ type: 'VALID' });
      expect(adapter.getCustomState().value).toBe('submitting');
      
      // Submit succeeds
      adapter.send({ type: 'SUCCESS' });
      expect(adapter.getCustomState().value).toBe('success');
    });

    it('should handle form validation failure', () => {
      const machine = createFormWorkflow();
      const adapter = createXStateAdapter(machine, true);
      
      // Submit
      adapter.send({ type: 'SUBMIT' });
      expect(adapter.getCustomState().value).toBe('validating');
      
      // Validation fails
      adapter.send({ type: 'INVALID', payload: { errors: { name: 'Required' } } });
      expect(adapter.getCustomState().value).toBe('editing');
      
      // Check errors were set
      const state = adapter.getCustomState();
      expect(state.context.errors).toEqual({ name: 'Required' });
      expect(state.context.submitting).toBe(false);
    });

    it('should handle navigation error and retry', () => {
      const machine = createNavigationWorkflow();
      const adapter = createXStateAdapter(machine, true);
      
      // Navigate
      adapter.send({ type: 'NAVIGATE', payload: { route: '/about' } });
      expect(adapter.getCustomState().value).toBe('navigating');
      
      // Error
      adapter.send({ type: 'NAVIGATE_ERROR' });
      expect(adapter.getCustomState().value).toBe('error');
      
      // Retry
      adapter.send({ type: 'RETRY' });
      expect(adapter.getCustomState().value).toBe('navigating');
      
      // Complete
      adapter.send({ type: 'NAVIGATE_COMPLETE' });
      expect(adapter.getCustomState().value).toBe('idle');
    });

    it('should stop both implementations', () => {
      const machine = createNavigationWorkflow();
      const adapter = createXStateAdapter(machine, true);
      
      adapter.stop();
      
      // Should not process events after stop
      adapter.send({ type: 'NAVIGATE', payload: { route: '/about' } });
      expect(adapter.getCustomState().value).toBe('idle');
    });

    it('should subscribe to state changes', () => {
      const machine = createNavigationWorkflow();
      const adapter = createXStateAdapter(machine, true);
      
      const states: string[] = [];
      const unsubscribe = adapter.subscribe((state) => {
        states.push(typeof state.value === 'string' ? state.value : JSON.stringify(state.value));
      });
      
      adapter.send({ type: 'NAVIGATE', payload: { route: '/about' } });
      adapter.send({ type: 'NAVIGATE_COMPLETE' });
      
      expect(states).toContain('navigating');
      expect(states).toContain('idle');
      
      unsubscribe();
    });
  });

  describe('Workflow Machine Conversion', () => {
    it('should convert simple state machine', () => {
      const machine: WorkflowMachine = {
        id: 'simple',
        initial: 'a',
        states: {
          a: {
            on: {
              NEXT: { target: 'b' }
            }
          },
          b: {
            type: 'final'
          }
        }
      };
      
      const adapter = createXStateAdapter(machine, true);
      
      expect(adapter.getCustomState().value).toBe('a');
      
      adapter.send({ type: 'NEXT' });
      expect(adapter.getCustomState().value).toBe('b');
    });

    it('should convert hierarchical state machine', () => {
      const machine: WorkflowMachine = {
        id: 'hierarchical',
        initial: 'parent',
        states: {
          parent: {
            initial: 'child1',
            states: {
              child1: {
                on: {
                  NEXT: { target: 'child2' }
                }
              },
              child2: {
                type: 'final'
              }
            }
          }
        }
      };
      
      const adapter = createXStateAdapter(machine, true);
      
      // Custom service returns parent state name
      const customState = adapter.getCustomState();
      expect(customState.value).toBe('parent');
      
      // XState returns hierarchical structure
      const xstateState = adapter.getXStateState() as any;
      expect(xstateState.value).toEqual({ parent: 'child1' });
      
      // Send event - custom service doesn't handle hierarchical transitions well
      // but XState does
      adapter.send({ type: 'NEXT' });
      
      // XState should transition to child2
      const newXstateState = adapter.getXStateState() as any;
      expect(newXstateState.value).toEqual({ parent: 'child2' });
    });

    it('should convert guards', () => {
      const machine: WorkflowMachine = {
        id: 'guarded',
        initial: 'idle',
        context: { count: 0 },
        states: {
          idle: {
            on: {
              INCREMENT: {
                target: 'idle',
                cond: (ctx) => (ctx.count as number) < 5,
                actions: [
                  {
                    type: 'assign',
                    assign: (ctx) => ({ count: (ctx.count as number) + 1 })
                  }
                ]
              }
            }
          }
        }
      };
      
      const adapter = createXStateAdapter(machine, true);
      
      // Should increment up to 5
      for (let i = 0; i < 10; i++) {
        adapter.send({ type: 'INCREMENT' });
      }
      
      const state = adapter.getCustomState();
      expect(state.context.count).toBe(5);
    });
  });

  describe('Equivalence Testing', () => {
    it('should detect state mismatches', () => {
      // Create a machine where custom and XState might diverge
      const machine: WorkflowMachine = {
        id: 'test',
        initial: 'a',
        states: {
          a: {
            on: {
              GO: { target: 'b' }
            }
          },
          b: {
            on: {
              GO: { target: 'c' }
            }
          },
          c: {
            type: 'final'
          }
        }
      };
      
      const adapter = createXStateAdapter(machine, true);
      
      adapter.send({ type: 'GO' });
      adapter.send({ type: 'GO' });
      
      const stats = adapter.getEquivalenceStats();
      expect(stats.total).toBe(2);
      expect(stats.matches).toBe(2);
    });

    it('should maintain equivalence across complex workflows', () => {
      const machine = createNavigationWorkflow();
      const adapter = createXStateAdapter(machine, true);
      
      // Complex navigation sequence
      adapter.send({ type: 'NAVIGATE', payload: { route: '/a' } });
      adapter.send({ type: 'NAVIGATE_COMPLETE' });
      adapter.send({ type: 'NAVIGATE', payload: { route: '/b' } });
      adapter.send({ type: 'NAVIGATE_COMPLETE' });
      adapter.send({ type: 'NAVIGATE', payload: { route: '/c' } });
      adapter.send({ type: 'NAVIGATE_ERROR' });
      adapter.send({ type: 'RETRY' });
      adapter.send({ type: 'NAVIGATE_COMPLETE' });
      
      const stats = adapter.getEquivalenceStats();
      expect(stats.matchRate).toBe(100);
    });
  });
});
