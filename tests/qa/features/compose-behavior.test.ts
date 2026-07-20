/**
 * Tests for Composed Component Architecture - Behavior Layer
 */

import { describe, it, expect } from 'vitest';
import {
  BehaviorService,
  createButtonMachine,
  createCheckboxMachine,
  createSwitchMachine,
  createTabsMachine,
  createDialogMachine,
  createBehaviorService
} from '../../../src/core/compose/behavior';
import { buttonSchema, checkboxSchema } from '../../../src/core/compose/vocabulary';

describe('Compose Behavior Layer', () => {
  describe('BehaviorService', () => {
    it('should initialize with machine initial state', () => {
      const machine = createButtonMachine();
      const service = new BehaviorService(machine, {
        schema: buttonSchema,
        state: machine.initial,
        props: {},
        handlers: {}
      });

      const state = service.getState();
      expect(state.disabled).toBe(false);
      expect(state.focused).toBe(false);
      expect(state.pressed).toBe(false);
    });

    it('should transition state on events', () => {
      const machine = createButtonMachine();
      const service = new BehaviorService(machine, {
        schema: buttonSchema,
        state: machine.initial,
        props: {},
        handlers: {}
      });

      service.send({ type: 'focus' });
      expect(service.getState().focused).toBe(true);

      service.send({ type: 'blur' });
      expect(service.getState().focused).toBe(false);
    });

    it('should respect guards', () => {
      const machine = createButtonMachine();
      const service = new BehaviorService(machine, {
        schema: buttonSchema,
        state: { ...machine.initial, disabled: true },
        props: {},
        handlers: {}
      });

      service.send({ type: 'pointerdown' });
      expect(service.getState().pressed).toBe(false); // Should not press when disabled
    });

    it('should execute actions during transitions', () => {
      const machine = createButtonMachine();
      let clickCalled = false;
      
      const service = new BehaviorService(machine, {
        schema: buttonSchema,
        state: machine.initial,
        props: {},
        handlers: {
          click: () => { clickCalled = true; }
        }
      });

      service.send({ type: 'click' });
      expect(clickCalled).toBe(true);
    });

    it('should notify subscribers of state changes', () => {
      const machine = createButtonMachine();
      const service = new BehaviorService(machine, {
        schema: buttonSchema,
        state: machine.initial,
        props: {},
        handlers: {}
      });

      let notified = false;
      service.subscribe(() => { notified = true; });

      service.send({ type: 'focus' });
      expect(notified).toBe(true);
    });

    it('should allow unsubscribing', () => {
      const machine = createButtonMachine();
      const service = new BehaviorService(machine, {
        schema: buttonSchema,
        state: machine.initial,
        props: {},
        handlers: {}
      });

      let callCount = 0;
      const unsubscribe = service.subscribe(() => { callCount++; });

      service.send({ type: 'focus' });
      expect(callCount).toBe(1);

      unsubscribe();
      service.send({ type: 'blur' });
      expect(callCount).toBe(1); // Should not increase
    });
  });

  describe('Button Machine', () => {
    it('should handle focus/blur', () => {
      const machine = createButtonMachine();
      const service = new BehaviorService(machine, {
        schema: buttonSchema,
        state: machine.initial,
        props: {},
        handlers: {}
      });

      service.send({ type: 'focus' });
      expect(service.getState().focused).toBe(true);

      service.send({ type: 'blur' });
      expect(service.getState().focused).toBe(false);
    });

    it('should handle hover', () => {
      const machine = createButtonMachine();
      const service = new BehaviorService(machine, {
        schema: buttonSchema,
        state: machine.initial,
        props: {},
        handlers: {}
      });

      service.send({ type: 'mouseenter' });
      expect(service.getState().hovered).toBe(true);

      service.send({ type: 'mouseleave' });
      expect(service.getState().hovered).toBe(false);
    });

    it('should handle press', () => {
      const machine = createButtonMachine();
      const service = new BehaviorService(machine, {
        schema: buttonSchema,
        state: machine.initial,
        props: {},
        handlers: {}
      });

      service.send({ type: 'pointerdown' });
      expect(service.getState().pressed).toBe(true);

      service.send({ type: 'pointerup' });
      expect(service.getState().pressed).toBe(false);
    });

    it('should handle loading state', () => {
      const machine = createButtonMachine();
      const service = new BehaviorService(machine, {
        schema: buttonSchema,
        state: machine.initial,
        props: {},
        handlers: {}
      });

      service.send({ type: 'loading:start' });
      expect(service.getState().loading).toBe(true);

      service.send({ type: 'loading:end' });
      expect(service.getState().loading).toBe(false);
    });
  });

  describe('Checkbox Machine', () => {
    it('should toggle selected state', () => {
      const machine = createCheckboxMachine();
      const service = new BehaviorService(machine, {
        schema: checkboxSchema,
        state: machine.initial,
        props: {},
        handlers: {}
      });

      expect(service.getState().selected).toBe(false);

      service.send({ type: 'toggle' });
      expect(service.getState().selected).toBe(true);

      service.send({ type: 'toggle' });
      expect(service.getState().selected).toBe(false);
    });

    it('should not toggle when disabled', () => {
      const machine = createCheckboxMachine();
      const service = new BehaviorService(machine, {
        schema: checkboxSchema,
        state: { ...machine.initial, disabled: true },
        props: {},
        handlers: {}
      });

      service.send({ type: 'toggle' });
      expect(service.getState().selected).toBe(false);
    });
  });

  describe('Switch Machine', () => {
    it('should toggle on/off', () => {
      const machine = createSwitchMachine();
      const service = new BehaviorService(machine, {
        schema: { ...buttonSchema, role: 'switch' },
        state: machine.initial,
        props: {},
        handlers: {}
      });

      expect(service.getState().selected).toBe(false);

      service.send({ type: 'toggle' });
      expect(service.getState().selected).toBe(true);

      service.send({ type: 'toggle' });
      expect(service.getState().selected).toBe(false);
    });
  });

  describe('Tabs Machine', () => {
    it('should navigate between tabs', () => {
      const machine = createTabsMachine(3);
      const service = new BehaviorService(machine, {
        schema: { ...buttonSchema, role: 'tabs' },
        state: machine.initial,
        props: {},
        handlers: {}
      });

      expect(service.getState().index).toBe(0);

      service.send({ type: 'next' });
      expect(service.getState().index).toBe(1);

      service.send({ type: 'next' });
      expect(service.getState().index).toBe(2);

      service.send({ type: 'next' });
      expect(service.getState().index).toBe(2); // Should not exceed max

      service.send({ type: 'previous' });
      expect(service.getState().index).toBe(1);

      service.send({ type: 'first' });
      expect(service.getState().index).toBe(0);

      service.send({ type: 'last' });
      expect(service.getState().index).toBe(2);
    });

    it('should select specific tab', () => {
      const machine = createTabsMachine(3);
      const service = new BehaviorService(machine, {
        schema: { ...buttonSchema, role: 'tabs' },
        state: machine.initial,
        props: {},
        handlers: {}
      });

      service.send({ type: 'select', payload: { index: 2 } });
      expect(service.getState().index).toBe(2);
    });
  });

  describe('Dialog Machine', () => {
    it('should open and close', () => {
      const machine = createDialogMachine();
      const service = new BehaviorService(machine, {
        schema: { ...buttonSchema, role: 'dialog' },
        state: machine.initial,
        props: {},
        handlers: {}
      });

      expect(service.getState().expanded).toBe(false);

      service.send({ type: 'open' });
      expect(service.getState().expanded).toBe(true);

      service.send({ type: 'close' });
      expect(service.getState().expanded).toBe(false);
    });

    it('should toggle', () => {
      const machine = createDialogMachine();
      const service = new BehaviorService(machine, {
        schema: { ...buttonSchema, role: 'dialog' },
        state: machine.initial,
        props: {},
        handlers: {}
      });

      service.send({ type: 'toggle' });
      expect(service.getState().expanded).toBe(true);

      service.send({ type: 'toggle' });
      expect(service.getState().expanded).toBe(false);
    });
  });

  describe('createBehaviorService', () => {
    it('should create service for button schema', () => {
      const service = createBehaviorService(buttonSchema);
      expect(service).toBeInstanceOf(BehaviorService);
      expect(service.getState().disabled).toBe(false);
    });

    it('should create service for checkbox schema', () => {
      const service = createBehaviorService(checkboxSchema);
      expect(service).toBeInstanceOf(BehaviorService);
      expect(service.getState().selected).toBe(false);
    });
  });
});
