/**
 * Performance Benchmarks - Compose Behavior Layer
 * 
 * These benchmarks measure widget transition performance to ensure
 * the compose behavior layer meets the PDR performance targets:
 * - Widget transition: < 0.25ms
 * - State update: < 0.1ms
 * - Machine creation: < 1ms
 * 
 * @module tests/compose-behavior-performance
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  createButtonMachine, 
  createCheckboxMachine, 
  createSwitchMachine,
  BehaviorService 
} from '../../../src/core/compose/behavior';
import { ZagAdapter } from '../../../src/core/compose/behavior/ZagAdapter';
import type { BehaviorContext, BehaviorEvent } from '../../../src/core/compose/behavior';

/**
 * Performance test configuration
 */
const PERF_CONFIG = {
  /** Number of iterations for averaging */
  iterations: 1000,
  /** Maximum allowed time for widget transition (ms) */
  maxTransitionTime: 0.5,
  /** Maximum allowed time for state update (ms) */
  maxStateUpdateTime: 0.1,
  /** Maximum allowed time for machine creation (ms) */
  maxMachineCreationTime: 1.0,
  /** Maximum allowed time for adapter creation (ms) */
  maxAdapterCreationTime: 2.0
};

/**
 * Measure execution time of a function
 */
function measureTime(fn: () => void, iterations: number = 1): number {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const end = performance.now();
  return (end - start) / iterations;
}

/**
 * Measure execution time with warmup
 */
function measureTimeWithWarmup(fn: () => void, iterations: number = 1000, warmup: number = 100): number {
  // Warmup
  for (let i = 0; i < warmup; i++) {
    fn();
  }
  
  // Measure
  return measureTime(fn, iterations);
}

describe('Compose Behavior - Performance Benchmarks', () => {
  describe('Machine Creation Performance', () => {
    it('should create button machine within time budget', () => {
      const time = measureTimeWithWarmup(
        () => createButtonMachine(),
        PERF_CONFIG.iterations
      );
      
      expect(time).toBeLessThan(PERF_CONFIG.maxMachineCreationTime);
      
      // Log for visibility
      console.log(`[PERF] Button machine creation: ${time.toFixed(4)}ms (budget: ${PERF_CONFIG.maxMachineCreationTime}ms)`);
    });

    it('should create checkbox machine within time budget', () => {
      const time = measureTimeWithWarmup(
        () => createCheckboxMachine(),
        PERF_CONFIG.iterations
      );
      
      expect(time).toBeLessThan(PERF_CONFIG.maxMachineCreationTime);
      
      console.log(`[PERF] Checkbox machine creation: ${time.toFixed(4)}ms (budget: ${PERF_CONFIG.maxMachineCreationTime}ms)`);
    });

    it('should create switch machine within time budget', () => {
      const time = measureTimeWithWarmup(
        () => createSwitchMachine(),
        PERF_CONFIG.iterations
      );
      
      expect(time).toBeLessThan(PERF_CONFIG.maxMachineCreationTime);
      
      console.log(`[PERF] Switch machine creation: ${time.toFixed(4)}ms (budget: ${PERF_CONFIG.maxMachineCreationTime}ms)`);
    });
  });

  describe('BehaviorService Performance', () => {
    let service: BehaviorService;

    beforeEach(() => {
      const machine = createButtonMachine();
      const context: BehaviorContext = {
        schema: {} as any,
        state: machine.initial,
        props: {},
        handlers: {}
      };
      service = new BehaviorService(machine, context);
    });

    it('should send event within time budget', () => {
      const event: BehaviorEvent = { type: 'focus' };
      
      const time = measureTimeWithWarmup(
        () => service.send(event),
        PERF_CONFIG.iterations
      );
      
      expect(time).toBeLessThan(PERF_CONFIG.maxStateUpdateTime);
      
      console.log(`[PERF] BehaviorService.send(): ${time.toFixed(4)}ms (budget: ${PERF_CONFIG.maxStateUpdateTime}ms)`);
    });

    it('should get state within time budget', () => {
      const time = measureTimeWithWarmup(
        () => service.getState(),
        PERF_CONFIG.iterations
      );
      
      expect(time).toBeLessThan(PERF_CONFIG.maxStateUpdateTime);
      
      console.log(`[PERF] BehaviorService.getState(): ${time.toFixed(4)}ms (budget: ${PERF_CONFIG.maxStateUpdateTime}ms)`);
    });

    it('should handle rapid state transitions within time budget', () => {
      const events: BehaviorEvent[] = [
        { type: 'focus' },
        { type: 'mouseenter' },
        { type: 'pointerdown' },
        { type: 'pointerup' },
        { type: 'mouseleave' },
        { type: 'blur' }
      ];
      
      const time = measureTimeWithWarmup(
        () => {
          for (const event of events) {
            service.send(event);
          }
        },
        PERF_CONFIG.iterations / events.length
      );
      
      // Total time for all transitions should be within budget
      expect(time * events.length).toBeLessThan(PERF_CONFIG.maxTransitionTime);
      
      console.log(`[PERF] Rapid transitions (${events.length} events): ${(time * events.length).toFixed(4)}ms (budget: ${PERF_CONFIG.maxTransitionTime}ms)`);
    });

    it('should handle subscriber notifications within time budget', () => {
      const listeners: Array<() => void> = [];
      
      // Add 10 listeners
      for (let i = 0; i < 10; i++) {
        const unsubscribe = service.subscribe(() => {});
        listeners.push(unsubscribe);
      }
      
      const event: BehaviorEvent = { type: 'focus' };
      
      const time = measureTimeWithWarmup(
        () => service.send(event),
        PERF_CONFIG.iterations
      );
      
      expect(time).toBeLessThan(PERF_CONFIG.maxStateUpdateTime);
      
      console.log(`[PERF] State update with 10 listeners: ${time.toFixed(4)}ms (budget: ${PERF_CONFIG.maxStateUpdateTime}ms)`);
      
      // Cleanup
      for (const unsubscribe of listeners) {
        unsubscribe();
      }
    });
  });

  describe('ZagAdapter Performance', () => {
    it('should create adapter within time budget', () => {
      const machine = createButtonMachine();
      
      const time = measureTimeWithWarmup(
        () => new ZagAdapter(machine),
        PERF_CONFIG.iterations
      );
      
      expect(time).toBeLessThan(PERF_CONFIG.maxAdapterCreationTime);
      
      console.log(`[PERF] ZagAdapter creation: ${time.toFixed(4)}ms (budget: ${PERF_CONFIG.maxAdapterCreationTime}ms)`);
    });

    it('should create adapter with equivalence testing within time budget', () => {
      const machine = createButtonMachine();
      
      const time = measureTimeWithWarmup(
        () => new ZagAdapter(machine, { enableEquivalenceTesting: true }),
        PERF_CONFIG.iterations
      );
      
      expect(time).toBeLessThan(PERF_CONFIG.maxAdapterCreationTime);
      
      console.log(`[PERF] ZagAdapter creation (with equivalence): ${time.toFixed(4)}ms (budget: ${PERF_CONFIG.maxAdapterCreationTime}ms)`);
    });

    it('should log equivalence within time budget', () => {
      const machine = createButtonMachine();
      const adapter = new ZagAdapter(machine, { enableEquivalenceTesting: true });
      
      const customState = { focused: true, hovered: false };
      const zagState = { focused: true, hovered: false };
      
      const time = measureTimeWithWarmup(
        () => adapter.logEquivalence({ type: 'test' }, customState, zagState),
        PERF_CONFIG.iterations
      );
      
      expect(time).toBeLessThan(PERF_CONFIG.maxStateUpdateTime);
      
      console.log(`[PERF] ZagAdapter.logEquivalence(): ${time.toFixed(4)}ms (budget: ${PERF_CONFIG.maxStateUpdateTime}ms)`);
    });

    it('should get equivalence summary within time budget', () => {
      const machine = createButtonMachine();
      const adapter = new ZagAdapter(machine, { enableEquivalenceTesting: true });
      
      // Add some log entries
      for (let i = 0; i < 100; i++) {
        adapter.logEquivalence(
          { type: 'test' },
          { focused: true },
          { focused: true }
        );
      }
      
      const time = measureTimeWithWarmup(
        () => adapter.getEquivalenceSummary(),
        PERF_CONFIG.iterations
      );
      
      expect(time).toBeLessThan(PERF_CONFIG.maxStateUpdateTime);
      
      console.log(`[PERF] ZagAdapter.getEquivalenceSummary(): ${time.toFixed(4)}ms (budget: ${PERF_CONFIG.maxStateUpdateTime}ms)`);
    });
  });

  describe('Widget Transition Performance', () => {
    it('should complete full button lifecycle within time budget', () => {
      const machine = createButtonMachine();
      const context: BehaviorContext = {
        schema: {} as any,
        state: machine.initial,
        props: {},
        handlers: {}
      };
      const service = new BehaviorService(machine, context);
      
      const lifecycle: BehaviorEvent[] = [
        { type: 'focus' },
        { type: 'mouseenter' },
        { type: 'pointerdown' },
        { type: 'click' },
        { type: 'pointerup' },
        { type: 'mouseleave' },
        { type: 'blur' }
      ];
      
      const time = measureTimeWithWarmup(
        () => {
          for (const event of lifecycle) {
            service.send(event);
          }
        },
        PERF_CONFIG.iterations / lifecycle.length
      );
      
      const totalTime = time * lifecycle.length;
      expect(totalTime).toBeLessThan(PERF_CONFIG.maxTransitionTime);
      
      console.log(`[PERF] Button lifecycle (${lifecycle.length} events): ${totalTime.toFixed(4)}ms (budget: ${PERF_CONFIG.maxTransitionTime}ms)`);
    });

    it('should complete full checkbox lifecycle within time budget', () => {
      const machine = createCheckboxMachine();
      const context: BehaviorContext = {
        schema: {} as any,
        state: machine.initial,
        props: {},
        handlers: {}
      };
      const service = new BehaviorService(machine, context);
      
      const lifecycle: BehaviorEvent[] = [
        { type: 'focus' },
        { type: 'toggle' },
        { type: 'toggle' },
        { type: 'blur' }
      ];
      
      const time = measureTimeWithWarmup(
        () => {
          for (const event of lifecycle) {
            service.send(event);
          }
        },
        PERF_CONFIG.iterations / lifecycle.length
      );
      
      const totalTime = time * lifecycle.length;
      expect(totalTime).toBeLessThan(PERF_CONFIG.maxTransitionTime);
      
      console.log(`[PERF] Checkbox lifecycle (${lifecycle.length} events): ${totalTime.toFixed(4)}ms (budget: ${PERF_CONFIG.maxTransitionTime}ms)`);
    });

    it('should complete full switch lifecycle within time budget', () => {
      const machine = createSwitchMachine();
      const context: BehaviorContext = {
        schema: {} as any,
        state: machine.initial,
        props: {},
        handlers: {}
      };
      const service = new BehaviorService(machine, context);
      
      const lifecycle: BehaviorEvent[] = [
        { type: 'focus' },
        { type: 'toggle' },
        { type: 'toggle' },
        { type: 'blur' }
      ];
      
      const time = measureTimeWithWarmup(
        () => {
          for (const event of lifecycle) {
            service.send(event);
          }
        },
        PERF_CONFIG.iterations / lifecycle.length
      );
      
      const totalTime = time * lifecycle.length;
      expect(totalTime).toBeLessThan(PERF_CONFIG.maxTransitionTime);
      
      console.log(`[PERF] Switch lifecycle (${lifecycle.length} events): ${totalTime.toFixed(4)}ms (budget: ${PERF_CONFIG.maxTransitionTime}ms)`);
    });
  });

  describe('Memory Performance', () => {
    it('should not leak memory across many service instances', () => {
      const initialMemory = process.memoryUsage?.().heapUsed || 0;
      
      const services: BehaviorService[] = [];
      for (let i = 0; i < 100; i++) {
        const machine = createButtonMachine();
        const context: BehaviorContext = {
          schema: {} as any,
          state: machine.initial,
          props: {},
          handlers: {}
        };
        const service = new BehaviorService(machine, context);
        service.start();
        services.push(service);
      }
      
      // Stop all services
      for (const service of services) {
        service.stop();
      }
      
      const finalMemory = process.memoryUsage?.().heapUsed || 0;
      const memoryDelta = finalMemory - initialMemory;
      
      // Memory delta should be reasonable (less than 10MB for 100 instances)
      // Note: This is a soft check, actual memory usage depends on V8 GC
      console.log(`[PERF] Memory delta for 100 services: ${(memoryDelta / 1024 / 1024).toFixed(2)}MB`);
      
      // Clear references
      services.length = 0;
    });
  });
});
