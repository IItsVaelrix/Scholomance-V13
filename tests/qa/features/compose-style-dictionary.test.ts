/**
 * Style Dictionary Integration Tests
 * 
 * Tests the DTCG token pipeline: reading DTCG tokens, generating CSS/JS/TS outputs.
 */

import { describe, it, expect } from 'vitest';
import {
  generateCSS,
  generateJS,
  generateTSDeclarations,
  dtcgToStyleDictionary,
  registerComposeTransforms,
} from '../../../src/core/compose/tokens/style-dictionary';
import type { DTCGDictionary } from '../../../src/core/compose/tokens/index';

// Sample DTCG token dictionary for testing
const sampleTokens: DTCGDictionary = {
  color: {
    primary: {
      '500': {
        $value: '#3b82f6',
        $type: 'color',
        $description: 'Primary color',
      },
    },
    neutral: {
      '900': {
        $value: '#111827',
        $type: 'color',
        $description: 'Dark neutral',
      },
    },
  },
  spacing: {
    sm: {
      $value: 8,
      $type: 'dimension',
      $description: 'Small spacing',
    },
    md: {
      $value: 16,
      $type: 'dimension',
      $description: 'Medium spacing',
    },
  },
  typography: {
    fontFamily: {
      base: {
        $value: 'Inter, system-ui, sans-serif',
        $type: 'fontFamily',
        $description: 'Base font',
      },
    },
    fontSize: {
      base: {
        $value: 16,
        $type: 'fontSize',
        $description: 'Base font size',
      },
    },
  },
  border: {
    radius: {
      md: {
        $value: 8,
        $type: 'borderRadius',
        $description: 'Medium border radius',
      },
    },
  },
  shadow: {
    md: {
      $value: {
        offsetX: 0,
        offsetY: 4,
        blur: 6,
        spread: -1,
        color: 'rgba(0, 0, 0, 0.1)',
      },
      $type: 'shadow',
      $description: 'Medium shadow',
    },
  },
  animation: {
    duration: {
      normal: {
        $value: 300,
        $type: 'duration',
        $description: 'Normal duration',
      },
    },
    easing: {
      'ease-in-out': {
        $value: [0.4, 0, 0.2, 1],
        $type: 'cubicBezier',
        $description: 'Ease in out',
      },
    },
  },
};

describe('Style Dictionary Integration', () => {
  describe('generateCSS', () => {
    it('should generate CSS custom properties from DTCG tokens', () => {
      const css = generateCSS(sampleTokens);

      expect(css).toContain(':root {');
      expect(css).toContain('--compose-color-primary-500: #3b82f6;');
      expect(css).toContain('--compose-color-neutral-900: #111827;');
      expect(css).toContain('--compose-spacing-sm: 8px;');
      expect(css).toContain('--compose-spacing-md: 16px;');
      expect(css).toContain('}');
    });

    it('should handle font family tokens', () => {
      const css = generateCSS(sampleTokens);
      expect(css).toContain('--compose-typography-font-family-base: Inter, system-ui, sans-serif;');
    });

    it('should handle font size tokens', () => {
      const css = generateCSS(sampleTokens);
      expect(css).toContain('--compose-typography-font-size-base: 16px;');
    });

    it('should handle border radius tokens', () => {
      const css = generateCSS(sampleTokens);
      expect(css).toContain('--compose-border-radius-md: 8px;');
    });

    it('should handle shadow tokens', () => {
      const css = generateCSS(sampleTokens);
      expect(css).toContain('--compose-shadow-md:');
      expect(css).toContain('0px');
      expect(css).toContain('4px');
      expect(css).toContain('6px');
      expect(css).toContain('rgba(0, 0, 0, 0.1)');
    });

    it('should handle duration tokens', () => {
      const css = generateCSS(sampleTokens);
      expect(css).toContain('--compose-animation-duration-normal: 300ms;');
    });

    it('should handle cubic bezier tokens', () => {
      const css = generateCSS(sampleTokens);
      expect(css).toContain('--compose-animation-easing-ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);');
    });

    it('should handle empty dictionary', () => {
      const css = generateCSS({});
      expect(css).toBe(':root {\n}');
    });

    it('should handle nested groups', () => {
      const nested: DTCGDictionary = {
        theme: {
          dark: {
            background: {
              $value: '#000000',
              $type: 'color',
            },
          },
        },
      };
      const css = generateCSS(nested);
      expect(css).toContain('--compose-theme-dark-background: #000000;');
    });
  });

  describe('generateJS', () => {
    it('should generate JavaScript constants from DTCG tokens', () => {
      const js = generateJS(sampleTokens);

      expect(js).toContain('// Auto-generated token constants');
      expect(js).toContain('export const colorPrimary500 = "#3b82f6";');
      expect(js).toContain('export const colorNeutral900 = "#111827";');
      expect(js).toContain('export const spacingSm = 8;');
      expect(js).toContain('export const spacingMd = 16;');
    });

    it('should handle font family tokens', () => {
      const js = generateJS(sampleTokens);
      expect(js).toContain('export const typographyFontFamilyBase = "Inter, system-ui, sans-serif";');
    });

    it('should handle shadow tokens as objects', () => {
      const js = generateJS(sampleTokens);
      expect(js).toContain('export const shadowMd =');
      expect(js).toContain('"offsetX"');
      expect(js).toContain('"offsetY"');
    });

    it('should handle cubic bezier tokens as arrays', () => {
      const js = generateJS(sampleTokens);
      expect(js).toContain('export const animationEasingEaseInOut = [0.4,0,0.2,1];');
    });

    it('should handle empty dictionary', () => {
      const js = generateJS({});
      expect(js).toContain('// Auto-generated token constants');
    });
  });

  describe('generateTSDeclarations', () => {
    it('should generate TypeScript declarations from DTCG tokens', () => {
      const ts = generateTSDeclarations(sampleTokens);

      expect(ts).toContain('// Auto-generated token type declarations');
      expect(ts).toContain('export const colorPrimary500: string;');
      expect(ts).toContain('export const spacingSm: number;');
    });

    it('should handle boolean tokens', () => {
      const tokens: DTCGDictionary = {
        feature: {
          enabled: {
            $value: true,
            $type: 'number',
          },
        },
      };
      const ts = generateTSDeclarations(tokens);
      // getTSType checks the actual value type, so boolean value → boolean type
      expect(ts).toContain('export const featureEnabled: boolean;');
    });

    it('should handle array tokens', () => {
      const ts = generateTSDeclarations(sampleTokens);
      expect(ts).toContain('export const animationEasingEaseInOut: unknown[];');
    });

    it('should handle object tokens', () => {
      const ts = generateTSDeclarations(sampleTokens);
      expect(ts).toContain('export const shadowMd: Record<string, unknown>;');
    });

    it('should handle empty dictionary', () => {
      const ts = generateTSDeclarations({});
      expect(ts).toContain('// Auto-generated token type declarations');
    });
  });

  describe('dtcgToStyleDictionary', () => {
    it('should convert DTCG dictionary to Style Dictionary format', () => {
      const sdTokens = dtcgToStyleDictionary(sampleTokens);

      expect(sdTokens).toHaveProperty('color');
      expect(sdTokens).toHaveProperty('spacing');

      const colorPrimary = (sdTokens.color as Record<string, Record<string, unknown>>).primary;
      expect(colorPrimary).toHaveProperty('500');

      const token500 = colorPrimary['500'] as Record<string, unknown>;
      expect(token500).toHaveProperty('value', '#3b82f6');
      expect(token500).toHaveProperty('type', 'color');
      expect(token500).toHaveProperty('description', 'Primary color');
      expect(token500).toHaveProperty('path');
      expect(token500).toHaveProperty('name', 'color.primary.500');
    });

    it('should handle nested groups', () => {
      const nested: DTCGDictionary = {
        theme: {
          dark: {
            bg: {
              $value: '#000',
              $type: 'color',
            },
          },
        },
      };
      const sdTokens = dtcgToStyleDictionary(nested);
      const theme = sdTokens.theme as Record<string, unknown>;
      expect(theme).toHaveProperty('dark');
    });

    it('should handle empty dictionary', () => {
      const sdTokens = dtcgToStyleDictionary({});
      expect(Object.keys(sdTokens)).toHaveLength(0);
    });
  });

  describe('registerComposeTransforms', () => {
    it('should register custom transforms without error', () => {
      // This is a smoke test - we just verify it doesn't throw
      // The actual transforms are tested through generateCSS/generateJS
      const StyleDictionary = require('style-dictionary').default;
      expect(() => registerComposeTransforms(StyleDictionary)).not.toThrow();
    });
  });

  describe('CSS output format', () => {
    it('should produce valid CSS that can be parsed', () => {
      const css = generateCSS(sampleTokens);
      
      // Basic CSS validity checks
      expect(css.startsWith(':root {')).toBe(true);
      expect(css.trim().endsWith('}')).toBe(true);
      
      // All lines should be valid CSS
      const lines = css.split('\n').filter(l => l.trim());
      for (const line of lines) {
        if (line === ':root {' || line === '}') continue;
        expect(line).toMatch(/^\s+--compose-[\w-]+:\s+.+;$/);
      }
    });

    it('should use compose- prefix for all variables', () => {
      const css = generateCSS(sampleTokens);
      const varLines = css.split('\n').filter(l => l.includes('--'));
      
      for (const line of varLines) {
        expect(line).toContain('--compose-');
      }
    });

    it('should use kebab-case for variable names', () => {
      const css = generateCSS(sampleTokens);
      const varLines = css.split('\n').filter(l => l.includes('--compose-'));
      
      for (const line of varLines) {
        // Extract variable name
        const match = line.match(/--compose-([\w-]+):/);
        expect(match).toBeTruthy();
        if (match) {
          const varName = match[1];
          // Should only contain lowercase letters, numbers, and hyphens
          expect(varName).toMatch(/^[a-z0-9-]+$/);
        }
      }
    });
  });

  describe('JS output format', () => {
    it('should produce valid JavaScript', () => {
      const js = generateJS(sampleTokens);
      
      // All export lines should start with valid JS export syntax
      const exportLines = js.split('\n').filter(l => l.startsWith('export const'));
      for (const line of exportLines) {
        // Match export const name = value (value may be multi-line for objects)
        expect(line).toMatch(/^export const \w+ = /);
      }
    });

    it('should use camelCase for constant names', () => {
      const js = generateJS(sampleTokens);
      const exportLines = js.split('\n').filter(l => l.startsWith('export const'));
      
      for (const line of exportLines) {
        const match = line.match(/export const (\w+)/);
        expect(match).toBeTruthy();
        if (match) {
          const name = match[1];
          // Should start with lowercase letter
          expect(name[0]).toMatch(/[a-z]/);
          // Should not contain hyphens
          expect(name).not.toContain('-');
        }
      }
    });
  });

  describe('Integration with token files', () => {
    it('should handle the full base.json token file', async () => {
      // Load the actual token file
      const fs = require('fs');
      const path = require('path');
      const tokenPath = path.join(process.cwd(), 'tokens/compose/base.json');
      
      if (fs.existsSync(tokenPath)) {
        const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf-8')) as DTCGDictionary;
        
        // Generate all outputs
        const css = generateCSS(tokens);
        const js = generateJS(tokens);
        const ts = generateTSDeclarations(tokens);
        
        // Verify outputs are non-empty
        expect(css.length).toBeGreaterThan(0);
        expect(js.length).toBeGreaterThan(0);
        expect(ts.length).toBeGreaterThan(0);
        
        // Verify key tokens are present
        expect(css).toContain('--compose-color-primary-500');
        expect(css).toContain('--compose-spacing-md');
        expect(css).toContain('--compose-typography-font-family-base');
        
        expect(js).toContain('colorPrimary500');
        expect(js).toContain('spacingMd');
      }
    });
  });
});
