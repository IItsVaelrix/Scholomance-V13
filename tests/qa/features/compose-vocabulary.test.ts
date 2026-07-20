/**
 * Tests for Composed Component Architecture - Vocabulary Layer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  buttonSchema,
  checkboxSchema,
  switchSchema,
  tabsSchema,
  dialogSchema,
  inputSchema,
  sliderSchema,
  tooltipSchema,
  registerVocabulary,
  getVocabularyByRole
} from '../../../src/core/compose/vocabulary';
import { schemaRegistry } from '../../../src/core/compose/schema/ComponentSchema';

describe('Compose Vocabulary Layer', () => {
  beforeEach(() => {
    schemaRegistry.clear();
  });

  describe('Vocabulary Schemas', () => {
    it('should define button schema with correct structure', () => {
      expect(buttonSchema.id).toBe('compose:button');
      expect(buttonSchema.role).toBe('button');
      expect(buttonSchema.anatomy.role).toBe('button');
      expect(buttonSchema.anatomy.interactive).toBe(true);
      expect(buttonSchema.accessibility?.ariaRole).toBe('button');
      expect(buttonSchema.accessibility?.keyboard).toContain('Enter: activates the button');
    });

    it('should define checkbox schema with toggle behavior', () => {
      expect(checkboxSchema.id).toBe('compose:checkbox');
      expect(checkboxSchema.role).toBe('checkbox');
      expect(checkboxSchema.initialState?.selected).toBe(false);
      expect(checkboxSchema.accessibility?.ariaAttributes).toContain('aria-checked');
    });

    it('should define switch schema with on/off states', () => {
      expect(switchSchema.id).toBe('compose:switch');
      expect(switchSchema.role).toBe('switch');
      expect(switchSchema.anatomy.children).toBeDefined();
      expect(switchSchema.anatomy.children?.find(c => c.id === 'track')).toBeDefined();
      expect(switchSchema.anatomy.children?.find(c => c.id === 'thumb')).toBeDefined();
    });

    it('should define tabs schema with tablist and panels', () => {
      expect(tabsSchema.id).toBe('compose:tabs');
      expect(tabsSchema.role).toBe('tabs');
      expect(tabsSchema.initialState?.index).toBe(0);
      expect(tabsSchema.anatomy.children?.find(c => c.role === 'tablist')).toBeDefined();
      expect(tabsSchema.anatomy.children?.find(c => c.role === 'tabpanel')).toBeDefined();
    });

    it('should define dialog schema with modal structure', () => {
      expect(dialogSchema.id).toBe('compose:dialog');
      expect(dialogSchema.role).toBe('dialog');
      expect(dialogSchema.initialState?.expanded).toBe(false);
      expect(dialogSchema.anatomy.children?.find(c => c.id === 'backdrop')).toBeDefined();
      expect(dialogSchema.anatomy.children?.find(c => c.id === 'content')).toBeDefined();
    });

    it('should define input schema with form validation', () => {
      expect(inputSchema.id).toBe('compose:input');
      expect(inputSchema.role).toBe('input');
      expect(inputSchema.initialState?.value).toBe('');
      expect(inputSchema.initialState?.invalid).toBe(false);
      expect(inputSchema.accessibility?.ariaRole).toBe('textbox');
    });

    it('should define slider schema with range input', () => {
      expect(sliderSchema.id).toBe('compose:slider');
      expect(sliderSchema.role).toBe('slider');
      expect(sliderSchema.initialState?.value).toBe(0);
      expect(sliderSchema.accessibility?.ariaAttributes).toContain('aria-valuemin');
      expect(sliderSchema.accessibility?.ariaAttributes).toContain('aria-valuemax');
    });

    it('should define tooltip schema with trigger and content', () => {
      expect(tooltipSchema.id).toBe('compose:tooltip');
      expect(tooltipSchema.role).toBe('tooltip');
      expect(tooltipSchema.initialState?.expanded).toBe(false);
      expect(tooltipSchema.anatomy.children?.find(c => c.id === 'trigger')).toBeDefined();
      expect(tooltipSchema.anatomy.children?.find(c => c.id === 'content')).toBeDefined();
    });
  });

  describe('registerVocabulary', () => {
    it('should register all vocabulary schemas', () => {
      registerVocabulary();

      expect(schemaRegistry.has('compose:button')).toBe(true);
      expect(schemaRegistry.has('compose:checkbox')).toBe(true);
      expect(schemaRegistry.has('compose:switch')).toBe(true);
      expect(schemaRegistry.has('compose:tabs')).toBe(true);
      expect(schemaRegistry.has('compose:dialog')).toBe(true);
      expect(schemaRegistry.has('compose:input')).toBe(true);
      expect(schemaRegistry.has('compose:slider')).toBe(true);
      expect(schemaRegistry.has('compose:tooltip')).toBe(true);
    });

    it('should not throw on duplicate registration', () => {
      registerVocabulary();
      
      // Should not throw
      expect(() => registerVocabulary()).not.toThrow();
    });
  });

  describe('getVocabularyByRole', () => {
    beforeEach(() => {
      registerVocabulary();
    });

    it('should find button schema by role', () => {
      const schema = getVocabularyByRole('button');
      expect(schema).toBeDefined();
      expect(schema?.id).toBe('compose:button');
    });

    it('should find checkbox schema by role', () => {
      const schema = getVocabularyByRole('checkbox');
      expect(schema).toBeDefined();
      expect(schema?.id).toBe('compose:checkbox');
    });

    it('should return undefined for unregistered role', () => {
      const schema = getVocabularyByRole('custom');
      expect(schema).toBeUndefined();
    });
  });
});
