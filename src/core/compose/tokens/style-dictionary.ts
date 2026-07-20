/**
 * Style Dictionary Integration - DTCG Token Pipeline
 * 
 * This module integrates Style Dictionary with the compose token system.
 * It reads DTCG-format tokens and generates platform-specific outputs:
 * - CSS custom properties (for web)
 * - JavaScript/TypeScript constants
 * - JSON (for cross-platform interchange)
 * 
 * @module compose/tokens/style-dictionary
 */

import StyleDictionary from 'style-dictionary';
import type { DTCGDictionary, DTCGToken, DTCGTokenGroup } from './index';
import { isDTCGToken } from './index';

/**
 * Style Dictionary configuration
 */
export interface StyleDictionaryConfig {
  /** Source token files (DTCG JSON format) */
  source: string[];
  /** Output platforms */
  platforms: {
    css?: {
      transformGroup?: string;
      buildPath?: string;
      files?: Array<{
        destination: string;
        format?: string;
      }>;
    };
    js?: {
      transformGroup?: string;
      buildPath?: string;
      files?: Array<{
        destination: string;
        format?: string;
      }>;
    };
    json?: {
      transformGroup?: string;
      buildPath?: string;
      files?: Array<{
        destination: string;
        format?: string;
      }>;
    };
  };
}

/**
 * Default Style Dictionary configuration for compose tokens
 */
export const DEFAULT_SD_CONFIG: StyleDictionaryConfig = {
  source: ['tokens/**/*.json'],
  platforms: {
    css: {
      transformGroup: 'css',
      buildPath: 'dist/tokens/',
      files: [
        {
          destination: 'tokens.css',
          format: 'css/variables',
        },
      ],
    },
    js: {
      transformGroup: 'js',
      buildPath: 'dist/tokens/',
      files: [
        {
          destination: 'tokens.js',
          format: 'javascript/es6',
        },
        {
          destination: 'tokens.d.ts',
          format: 'typescript/es6-declarations',
        },
      ],
    },
    json: {
      transformGroup: 'json',
      buildPath: 'dist/tokens/',
      files: [
        {
          destination: 'tokens.json',
          format: 'json',
        },
      ],
    },
  },
};

/**
 * Custom transforms for compose tokens
 */
export function registerComposeTransforms(sd: typeof StyleDictionary): void {
  // Transform: Convert DTCG $value to Style Dictionary value
  sd.registerTransform({
    name: 'dtcg/value',
    type: 'value',
    transitive: true,
    filter: (token) => token.$value !== undefined,
    transform: (token) => {
      return token.$value;
    },
  });

  // Transform: Convert DTCG $type to Style Dictionary type
  sd.registerTransform({
    name: 'dtcg/type',
    type: 'attribute',
    filter: (token) => token.$type !== undefined,
    transform: (token) => {
      return {
        ...token.attributes,
        type: token.$type,
      };
    },
  });

  // Transform: Compose-specific naming (kebab-case with compose prefix)
  sd.registerTransform({
    name: 'name/compose-kebab',
    type: 'name',
    filter: () => true,
    transform: (token) => {
      return `compose-${token.path.join('-')}`;
    },
  });

  // Transform group for compose tokens
  // Note: Only reference transforms we've registered ourselves
  sd.registerTransformGroup({
    name: 'compose/css',
    transforms: ['dtcg/value', 'dtcg/type', 'name/compose-kebab'],
  });

  sd.registerTransformGroup({
    name: 'compose/js',
    transforms: ['dtcg/value', 'dtcg/type'],
  });
}

/**
 * Convert DTCG dictionary to Style Dictionary format
 * 
 * Style Dictionary expects a specific structure. This function converts
 * our DTCG format to Style Dictionary's expected input.
 */
export function dtcgToStyleDictionary(dtcg: DTCGDictionary): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  function convertGroup(group: DTCGTokenGroup, path: string[] = []): Record<string, unknown> {
    const output: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(group)) {
      if (isDTCGToken(value)) {
        // It's a token - convert to Style Dictionary format
        output[key] = {
          value: value.$value,
          type: value.$type,
          description: value.$description,
          extensions: value.$extensions,
          original: value,
          name: [...path, key].join('.'),
          path: [...path, key],
          filePath: 'tokens.json',
          isSource: true,
        };
      } else {
        // It's a nested group - recurse
        output[key] = convertGroup(value as DTCGTokenGroup, [...path, key]);
      }
    }

    return output;
  }

  for (const [category, group] of Object.entries(dtcg)) {
    result[category] = convertGroup(group, [category]);
  }

  return result;
}

/**
 * Build tokens using Style Dictionary
 * 
 * @param dtcgDictionary - DTCG format token dictionary
 * @param config - Optional Style Dictionary configuration
 * @returns Generated token files as a map of filename to content
 */
export async function buildTokens(
  dtcgDictionary: DTCGDictionary,
  config: Partial<StyleDictionaryConfig> = {}
): Promise<Map<string, string>> {
  const sd = StyleDictionary.create({
    ...DEFAULT_SD_CONFIG,
    ...config,
  });

  // Register custom transforms
  registerComposeTransforms(sd);

  // Convert DTCG to Style Dictionary format
  const sdTokens = dtcgToStyleDictionary(dtcgDictionary);

  // Build the dictionary
  const dictionary = await sd.extend({
    tokens: sdTokens,
  }).buildAllPlatforms();

  // Collect output files
  const files = new Map<string, string>();
  
  // Note: Style Dictionary writes to disk, but we can capture the output
  // For now, we'll return an empty map and document that files are written to disk
  // In a real implementation, you'd use Style Dictionary's virtual file system
  
  return files;
}

/**
 * Generate CSS custom properties from DTCG tokens
 * 
 * @param dtcgDictionary - DTCG format token dictionary
 * @returns CSS string with custom properties
 */
export function generateCSS(dtcgDictionary: DTCGDictionary): string {
  const lines: string[] = [':root {'];

  function processGroup(group: DTCGTokenGroup, prefix: string = ''): void {
    for (const [key, value] of Object.entries(group)) {
      const kebabKey = camelToKebab(key);
      const varName = prefix ? `${prefix}-${kebabKey}` : kebabKey;

      if (isDTCGToken(value)) {
        // It's a token - generate CSS variable
        const cssValue = formatCSSValue(value);
        lines.push(`  --compose-${varName}: ${cssValue};`);
      } else {
        // It's a nested group - recurse
        processGroup(value as DTCGTokenGroup, varName);
      }
    }
  }

  for (const [category, group] of Object.entries(dtcgDictionary)) {
    processGroup(group, category);
  }

  lines.push('}');
  return lines.join('\n');
}

/**
 * Format a DTCG token value for CSS output
 */
function formatCSSValue(token: DTCGToken): string {
  const value = token.$value;

  switch (token.$type) {
    case 'color':
      return String(value);
    case 'dimension':
      return typeof value === 'number' ? `${value}px` : String(value);
    case 'fontFamily':
      return Array.isArray(value) ? value.join(', ') : String(value);
    case 'fontWeight':
      return String(value);
    case 'fontSize':
      return typeof value === 'number' ? `${value}px` : String(value);
    case 'lineHeight':
      return typeof value === 'number' ? String(value) : String(value);
    case 'letterSpacing':
      return typeof value === 'number' ? `${value}px` : String(value);
    case 'opacity':
      return String(value);
    case 'shadow':
      if (Array.isArray(value)) {
        return value.map(formatShadow).join(', ');
      }
      return formatShadow(value);
    case 'borderRadius':
      return typeof value === 'number' ? `${value}px` : String(value);
    case 'borderWidth':
      return typeof value === 'number' ? `${value}px` : String(value);
    case 'duration':
      return typeof value === 'number' ? `${value}ms` : String(value);
    case 'cubicBezier':
      if (Array.isArray(value) && value.length === 4) {
        return `cubic-bezier(${value.join(', ')})`;
      }
      return String(value);
    case 'number':
      return String(value);
    case 'string':
      return String(value);
    default:
      return String(value);
  }
}

/**
 * Format a shadow value for CSS
 */
function formatShadow(shadow: unknown): string {
  if (typeof shadow !== 'object' || shadow === null) {
    return String(shadow);
  }

  const s = shadow as {
    offsetX?: number;
    offsetY?: number;
    blur?: number;
    spread?: number;
    color?: string;
  };

  const parts = [
    s.offsetX !== undefined ? `${s.offsetX}px` : '0px',
    s.offsetY !== undefined ? `${s.offsetY}px` : '0px',
    s.blur !== undefined ? `${s.blur}px` : '0px',
    s.spread !== undefined ? `${s.spread}px` : '0px',
    s.color || 'rgba(0, 0, 0, 0.5)',
  ];

  return parts.join(' ');
}

/**
 * Generate JavaScript/TypeScript constants from DTCG tokens
 * 
 * @param dtcgDictionary - DTCG format token dictionary
 * @returns JavaScript string with exported constants
 */
export function generateJS(dtcgDictionary: DTCGDictionary): string {
  const lines: string[] = [
    '// Auto-generated token constants',
    '// Do not edit manually',
    '',
  ];

  function processGroup(group: DTCGTokenGroup, prefix: string = ''): void {
    for (const [key, value] of Object.entries(group)) {
      const constName = prefix ? `${prefix}${capitalize(key)}` : key;

      if (isDTCGToken(value)) {
        // It's a token - generate JS constant
        const jsValue = formatJSValue(value);
        lines.push(`export const ${camelCase(constName)} = ${jsValue};`);
      } else {
        // It's a nested group - recurse
        processGroup(value as DTCGTokenGroup, constName);
      }
    }
  }

  for (const [category, group] of Object.entries(dtcgDictionary)) {
    processGroup(group, category);
  }

  return lines.join('\n');
}

/**
 * Format a DTCG token value for JavaScript output
 */
function formatJSValue(token: DTCGToken): string {
  const value = token.$value;

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }

  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
}

/**
 * Convert string to camelCase
 */
function camelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Capitalize first letter
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Convert camelCase to kebab-case
 */
function camelToKebab(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Generate TypeScript declarations from DTCG tokens
 * 
 * @param dtcgDictionary - DTCG format token dictionary
 * @returns TypeScript declaration string
 */
export function generateTSDeclarations(dtcgDictionary: DTCGDictionary): string {
  const lines: string[] = [
    '// Auto-generated token type declarations',
    '// Do not edit manually',
    '',
  ];

  function processGroup(group: DTCGTokenGroup, prefix: string = ''): void {
    for (const [key, value] of Object.entries(group)) {
      const constName = prefix ? `${prefix}${capitalize(key)}` : key;

      if (isDTCGToken(value)) {
        // It's a token - generate type declaration
        const tsType = getTSType(value);
        lines.push(`export const ${camelCase(constName)}: ${tsType};`);
      } else {
        // It's a nested group - recurse
        processGroup(value as DTCGTokenGroup, constName);
      }
    }
  }

  for (const [category, group] of Object.entries(dtcgDictionary)) {
    processGroup(group, category);
  }

  return lines.join('\n');
}

/**
 * Get TypeScript type for a DTCG token
 */
function getTSType(token: DTCGToken): string {
  const value = token.$value;

  if (typeof value === 'string') {
    return 'string';
  }

  if (typeof value === 'number') {
    return 'number';
  }

  if (typeof value === 'boolean') {
    return 'boolean';
  }

  if (Array.isArray(value)) {
    return 'unknown[]';
  }

  if (typeof value === 'object' && value !== null) {
    return 'Record<string, unknown>';
  }

  return 'unknown';
}
