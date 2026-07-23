/**
 * Zag.js Adapter for Compose Behavior Layer
 * 
 * This adapter bridges the custom BehaviorService state machines with Zag.js machines.
 * It uses Zag's pre-built widget machines (toggle, switch, etc.) and provides
 * behavioral equivalence testing between custom and Zag implementations.
 * 
 * @module compose/behavior/ZagAdapter
 */

import { useMachine, normalizeProps } from '@zag-js/react';
import * as toggle from '@zag-js/toggle';
import * as zagSwitch from '@zag-js/switch';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { ComponentState } from '../schema/ComponentSchema';
import type { BehaviorMachine, BehaviorService, BehaviorContext, BehaviorEvent } from './index';
import { BehaviorService as BehaviorServiceImpl } from './index';

/**
 * Zag adapter configuration
 */
export type ZagAdapterConfig = {
  /** Enable behavioral equivalence testing */
  enableEquivalenceTesting?: boolean;
  /** Log state transitions for debugging */
  enableLogging?: boolean;
  /** Custom state mapper (Zag state → ComponentState) */
  stateMapper?: (zagApi: any) => ComponentState;
};

/**
 * Equivalence log entry
 */
export type EquivalenceEntry = {
  timestamp: number;
  event: string;
  customState: ComponentState;
  zagState: ComponentState;
  equivalent: boolean;
};

/**
 * Zag adapter - wraps custom behavior machines with Zag.js equivalents
 */
export class ZagAdapter {
  private customMachine: BehaviorMachine;
  private config: ZagAdapterConfig;
  private equivalenceLog: EquivalenceEntry[] = [];

  constructor(customMachine: BehaviorMachine, config: ZagAdapterConfig = {}) {
    this.customMachine = customMachine;
    this.config = {
      enableEquivalenceTesting: false,
      enableLogging: false,
      ...config
    };
  }

  /**
   * Get the custom machine
   */
  getCustomMachine(): BehaviorMachine {
    return this.customMachine;
  }

  /**
   * Get the appropriate Zag machine for this component type
   */
  getZagMachine(): any {
    switch (this.customMachine.id) {
      case 'button':
      case 'toggle':
        return toggle.machine;
      case 'switch':
        return zagSwitch.machine;
      default:
        // For unsupported widgets, return null
        // The consumer should fall back to custom behavior
        return null;
    }
  }

  /**
   * Log equivalence test result
   */
  logEquivalence(
    event: BehaviorEvent | string,
    customState: ComponentState,
    zagState: ComponentState
  ): void {
    if (!this.config.enableEquivalenceTesting) return;

    const equivalent = this.statesEquivalent(customState, zagState);
    const eventType = typeof event === 'string' ? event : event.type;
    
    this.equivalenceLog.push({
      timestamp: Date.now(),
      event: eventType,
      customState,
      zagState,
      equivalent
    });

    if (this.config.enableLogging && !equivalent) {
      console.warn('[ZagAdapter] Behavioral divergence detected:', {
        event: eventType,
        customState,
        zagState
      });
    }
  }

  /**
   * Check if two states are equivalent
   */
  private statesEquivalent(state1: ComponentState, state2: ComponentState): boolean {
    // Only compare keys that exist in both states
    const allKeys = [
      ...Object.keys(state1).filter(k => k in state2),
      ...Object.keys(state2).filter(k => k in state1)
    ];

    for (const key of allKeys) {
      if (state1[key] !== state2[key]) return false;
    }

    return true;
  }

  /**
   * Get equivalence log
   */
  getEquivalenceLog(): EquivalenceEntry[] {
    return [...this.equivalenceLog];
  }

  /**
   * Clear equivalence log
   */
  clearEquivalenceLog(): void {
    this.equivalenceLog = [];
  }

  /**
   * Get equivalence test results summary
   */
  getEquivalenceSummary() {
    const total = this.equivalenceLog.length;
    const passed = this.equivalenceLog.filter(e => e.equivalent).length;
    const failed = total - passed;

    return {
      total,
      passed,
      failed,
      passRate: total > 0 ? (passed / total) * 100 : 0
    };
  }
}

/**
 * React hook for using Zag toggle machine
 */
export function useZagToggle(props: { pressed?: boolean; onPressedChange?: (pressed: boolean) => void } = {}) {
  const service = useMachine(toggle.machine, props);
  const api = toggle.connect(service, normalizeProps);
  return { service, api };
}

/**
 * React hook for using Zag switch machine
 */
export function useZagSwitch(props: { checked?: boolean; onCheckedChange?: (checked: boolean) => void } = {}) {
  const { onCheckedChange, ...rest } = props;
  const service = useMachine(zagSwitch.machine, {
    ...rest,
    onCheckedChange: onCheckedChange
      ? (details: { checked: boolean }) => onCheckedChange(details.checked)
      : undefined,
  });
  const api = zagSwitch.connect(service, normalizeProps);
  return { service, api };
}

/**
 * React hook for shadow mode behavioral equivalence testing
 */
export function useShadowMode(
  customMachine: BehaviorMachine,
  zagApi: any,
  config: ZagAdapterConfig = {}
) {
  const adapter = useMemo(() => new ZagAdapter(customMachine, config), [customMachine, config]);
  const customServiceRef = useRef<BehaviorServiceImpl | null>(null);
  const [divergences, setDivergences] = useState<EquivalenceEntry[]>([]);

  // Initialize custom service
  useEffect(() => {
    const context: BehaviorContext = {
      schema: {} as any,
      state: customMachine.initial,
      props: {},
      handlers: {}
    };
    
    customServiceRef.current = new BehaviorServiceImpl(customMachine, context);
    customServiceRef.current.start();
    
    return () => {
      customServiceRef.current?.stop();
    };
  }, [customMachine]);

  // Compare states when Zag API changes
  const checkEquivalence = useCallback((zagState: ComponentState) => {
    if (!customServiceRef.current) return;

    const customState = customServiceRef.current.getState();
    
    adapter.logEquivalence('state.sync', customState, zagState);

    // Check for divergence
    const commonKeys = new Set([
      ...Object.keys(customState).filter(k => k in zagState),
      ...Object.keys(zagState).filter(k => k in customState)
    ]);

    const diff: string[] = [];
    for (const key of commonKeys) {
      if (customState[key] !== zagState[key]) {
        diff.push(`${key}: custom=${customState[key]} vs zag=${zagState[key]}`);
      }
    }

    if (diff.length > 0) {
      const entry: EquivalenceEntry = {
        timestamp: Date.now(),
        event: 'state.sync',
        customState,
        zagState,
        equivalent: false
      };
      setDivergences(prev => [...prev, entry]);
    }
  }, [adapter]);

  return {
    adapter,
    divergences,
    checkEquivalence,
    getEquivalenceSummary: () => adapter.getEquivalenceSummary()
  };
}

/**
 * Create a Zag adapter for a specific machine type
 */
export function createZagAdapter(
  machineFactory: () => BehaviorMachine,
  config?: ZagAdapterConfig
): ZagAdapter {
  const machine = machineFactory();
  return new ZagAdapter(machine, config);
}
