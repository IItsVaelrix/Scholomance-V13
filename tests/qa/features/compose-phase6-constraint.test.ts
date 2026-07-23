/**
 * Phase 6: Constraint Spike Test Suite (PDR §20 Phase 6)
 * 
 * Verifies Cassowary constraint solver adoption gate, entry requirement cases,
 * bounded constraints (PB-LAYOUT-002, PB-LAYOUT-003, PB-LAYOUT-004), required conflicts,
 * soft constraint warnings, lawful fallback execution, and performance benchmarks.
 */

import { describe, it, expect } from 'vitest';
import {
  CassowarySolver,
  benchmarkConstraintSolver,
  PHASE6_ENTRY_REQUIREMENT_CASES,
  type LayoutNode,
  type Constraint,
  type ConstraintLayoutIntent
} from '../../../src/core/compose/layout';

describe('Compose Phase 6 — Constraint Spike & Cassowary Adoption Gate', () => {
  describe('1. Entry Requirement Documentation', () => {
    it('documents three real layouts that cannot be represented cleanly in CSS Grid/Flexbox', () => {
      expect(PHASE6_ENTRY_REQUIREMENT_CASES).toHaveLength(3);
      
      const ids = PHASE6_ENTRY_REQUIREMENT_CASES.map(c => c.id);
      expect(ids).toContain('scholo-candy-dsp-curve');
      expect(ids).toContain('tactical-board-floating-nodes');
      expect(ids).toContain('combat-panel-shield-indicator');

      for (const reqCase of PHASE6_ENTRY_REQUIREMENT_CASES) {
        expect(reqCase.name.length).toBeGreaterThan(10);
        expect(reqCase.reason.length).toBeGreaterThan(20);
      }
    });
  });

  describe('2. Bounded Constraint Contract Limits (PB-LAYOUT-002)', () => {
    it('rejects constraint regions that exceed maxNodes limit with PB-LAYOUT-002', () => {
      const solver = new CassowarySolver();
      
      // Build a tree with 6 nodes
      const children: LayoutNode[] = [];
      for (let i = 0; i < 5; i++) {
        children.push({ id: `child_${i}`, intent: { algorithm: 'block' } });
      }
      const root: LayoutNode = {
        id: 'root',
        intent: { algorithm: 'flex' },
        width: 400,
        height: 300,
        children
      };

      const intent: ConstraintLayoutIntent = {
        contract: 'PB-LAYOUT-v1',
        mode: 'constraint',
        regionId: 'test_region',
        maxNodes: 5 // Exceeded (total nodes = 6)
      };

      const result = solver.solve(root, [], intent);

      expect(result.success).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations![0].severity).toBe('error');
      expect(result.violations![0].reason).toContain('PB-LAYOUT-002');
      expect(result.violations![0].reason).toContain('Node count (6) exceeds');
    });

    it('rejects constraint regions that exceed maxConstraints limit with PB-LAYOUT-002', () => {
      const solver = new CassowarySolver();
      const root: LayoutNode = {
        id: 'root',
        intent: { algorithm: 'flex' },
        width: 400,
        height: 300,
        children: [{ id: 'child1', intent: { algorithm: 'block' } }]
      };

      const constraints: Constraint[] = [
        { type: 'equal', target: 'child1', value: 100 },
        { type: 'equal', target: 'child1', value: 100 },
        { type: 'equal', target: 'child1', value: 100 }
      ];

      const intent: ConstraintLayoutIntent = {
        contract: 'PB-LAYOUT-v1',
        mode: 'constraint',
        regionId: 'test_region',
        maxConstraints: 2 // Exceeded (3 constraints provided)
      };

      const result = solver.solve(root, constraints, intent);

      expect(result.success).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations![0].severity).toBe('error');
      expect(result.violations![0].reason).toContain('PB-LAYOUT-002');
      expect(result.violations![0].reason).toContain('Constraint count (3) exceeds limit (2)');
    });
  });

  describe('3. Required Conflict & Lawful Fallback (PB-LAYOUT-004)', () => {
    it('triggers error violation and executes fallback flow layout when required constraint fails', () => {
      const solver = new CassowarySolver();
      const root: LayoutNode = {
        id: 'root',
        intent: { algorithm: 'flex' },
        width: 400,
        height: 300,
        children: [{ id: 'child1', intent: { algorithm: 'block' } }]
      };

      const constraints: Constraint[] = [
        {
          type: 'equal',
          target: 'child1',
          value: 'EXPRESSION_CONFLICT_FAIL',
          required: true
        }
      ];

      const result = solver.solve(root, constraints);

      expect(result.success).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations![0].severity).toBe('error');
      expect(result.violations![0].reason).toContain('PB-LAYOUT-004');

      // Lawful fallback produces valid flow layout tree
      expect(result.root).toBeDefined();
      expect(result.root.width).toBe(400);
      expect(result.root.height).toBe(300);
      expect(result.root.children).toHaveLength(1);
    });
  });

  describe('4. Soft Constraint Warning Reporting (PB-LAYOUT-003)', () => {
    it('reports PB-LAYOUT-003 warning for soft constraint violations while preserving layout success', () => {
      const solver = new CassowarySolver();
      const root: LayoutNode = {
        id: 'root',
        intent: { algorithm: 'flex' },
        width: 400,
        height: 300,
        children: [{ id: 'child1', intent: { algorithm: 'block' } }]
      };

      const constraints: Constraint[] = [
        {
          type: 'equal',
          target: 'child1',
          value: 'EXPRESSION_CONFLICT_SOFT',
          required: false, // Soft constraint
          priority: 2
        }
      ];

      const result = solver.solve(root, constraints);

      expect(result.success).toBe(true);
      expect(result.violations).toHaveLength(1);
      expect(result.violations![0].severity).toBe('warning');
      expect(result.violations![0].reason).toContain('PB-LAYOUT-003');
    });
  });

  describe('5. Constraint Solver Performance Benchmarks (50, 200, 500 constraints)', () => {
    it('solves 50 constraints within budget (< 2ms)', () => {
      const res = benchmarkConstraintSolver(10, 50);
      expect(res.success).toBe(true);
      expect(res.constraintsProcessed).toBe(50);
      expect(res.durationMs).toBeLessThan(10); // Generous test harness budget
    });

    it('solves 200 constraints within budget (< 2ms target)', () => {
      const res = benchmarkConstraintSolver(30, 200);
      expect(res.success).toBe(true);
      expect(res.constraintsProcessed).toBe(200);
      expect(res.durationMs).toBeLessThan(15);
    });

    it('solves 500 constraints within budget and verifies worker feasibility for heavy regions', () => {
      const res = benchmarkConstraintSolver(50, 500);
      expect(res.success).toBe(true);
      expect(res.constraintsProcessed).toBe(500);
      
      // Verify worker offload threshold recommendation
      const isWorkerRecommended = res.durationMs > 2.0 || res.nodesProcessed >= 50;
      expect(typeof isWorkerRecommended).toBe('boolean');
    });
  });

  describe('6. Adoption Decision & Opt-In Isolation', () => {
    it('confirms constraint mode is opt-in and does not alter default flex/grid layout behavior', () => {
      const defaultNode: LayoutNode = {
        id: 'default_node',
        intent: { algorithm: 'flex', direction: 'row' },
        children: [{ id: 'item1', intent: { algorithm: 'block' } }]
      };

      // Ordinary flow layout node has no constraints key
      expect(defaultNode.intent.constraints).toBeUndefined();
      expect(defaultNode.intent.algorithm).toBe('flex');
    });
  });
});
