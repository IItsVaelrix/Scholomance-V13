/**
 * Design Tokens Layer - DTCG format + Style Dictionary
 * 
 * Cross-platform token interchange and output generation.
 * Tokens define colors, spacing, typography, shadows, etc.
 * 
 * FIX: Added DTCG (Design Token Community Group) format support alongside
 * the existing flat token format. DTCG uses nested objects with $value/$type
 * properties. Both formats are supported for backward compatibility.
 * 
 * @module compose/tokens
 */

/**
 * Token types - expanded to match DTCG spec
 */
export type TokenType = 
  | 'color'
  | 'dimension'
  | 'fontFamily'
  | 'fontWeight'
  | 'fontSize'
  | 'lineHeight'
  | 'letterSpacing'
  | 'paragraphSpacing'
  | 'opacity'
  | 'shadow'
  | 'borderRadius'
  | 'borderWidth'
  | 'duration'
  | 'cubicBezier'
  | 'number'
  | 'string';

/**
 * Legacy design token (flat format)
 * @deprecated Use DTCGToken for new tokens
 */
export type DesignToken = {
  /** Token value */
  value: unknown;
  /** Token type */
  type: TokenType;
  /** Human-readable description */
  description?: string;
  /** Token extensions (custom metadata) */
  extensions?: Record<string, unknown>;
};

/**
 * DTCG format token
 * 
 * The Design Token Community Group format uses:
 * - $value for the token value
 * - $type for the token type
 * - $description for documentation
 * - $extensions for custom metadata
 * 
 * Tokens are organized in nested groups (not flat).
 */
export type DTCGToken = {
  /** Token value (DTCG uses $ prefix) */
  $value: unknown;
  /** Token type (DTCG uses $ prefix) */
  $type: TokenType;
  /** Human-readable description */
  $description?: string;
  /** Token extensions (custom metadata) */
  $extensions?: Record<string, unknown>;
};

/**
 * DTCG token group - a collection of tokens or nested groups
 */
export type DTCGTokenGroup = {
  [key: string]: DTCGToken | DTCGTokenGroup;
};

/**
 * DTCG design token dictionary - complete token set in DTCG format
 */
export type DTCGDictionary = {
  [category: string]: DTCGTokenGroup;
};

/**
 * Legacy token group (flat format)
 * @deprecated Use DTCGTokenGroup for new tokens
 */
export type TokenGroup = {
  [key: string]: DesignToken | TokenGroup;
};

/**
 * Legacy design token dictionary
 * @deprecated Use DTCGDictionary for new tokens
 */
export type DesignTokenDictionary = {
  [category: string]: TokenGroup;
};

// ─── Format Conversion ───────────────────────────────────────────────────────

/**
 * Check if a value is a DTCG token
 */
export function isDTCGToken(value: unknown): value is DTCGToken {
  return typeof value === 'object' && value !== null && '$value' in value;
}

/**
 * Check if a value is a legacy token
 */
export function isLegacyToken(value: unknown): value is DesignToken {
  return typeof value === 'object' && value !== null && 'value' in value && !('$value' in value);
}

/**
 * Convert a legacy token to DTCG format
 */
export function legacyToDTCG(token: DesignToken): DTCGToken {
  return {
    $value: token.value,
    $type: token.type,
    $description: token.description,
    $extensions: token.extensions,
  };
}

/**
 * Convert a DTCG token to legacy format
 */
export function dtcgToLegacy(token: DTCGToken): DesignToken {
  return {
    value: token.$value,
    type: token.$type,
    description: token.$description,
    extensions: token.$extensions,
  };
}

/**
 * Convert a legacy dictionary to DTCG format
 */
export function dictionaryToDTCG(dict: DesignTokenDictionary): DTCGDictionary {
  const result: DTCGDictionary = {};
  
  for (const [category, group] of Object.entries(dict)) {
    result[category] = convertGroupToDTCG(group);
  }
  
  return result;
}

/**
 * Convert a token group to DTCG format
 */
function convertGroupToDTCG(group: TokenGroup): DTCGTokenGroup {
  const result: DTCGTokenGroup = {};
  
  for (const [key, value] of Object.entries(group)) {
    if (isLegacyToken(value)) {
      result[key] = legacyToDTCG(value);
    } else {
      result[key] = convertGroupToDTCG(value as TokenGroup);
    }
  }
  
  return result;
}

/**
 * Convert a DTCG dictionary to legacy format
 */
export function dtcgToDictionary(dtcg: DTCGDictionary): DesignTokenDictionary {
  const result: DesignTokenDictionary = {};
  
  for (const [category, group] of Object.entries(dtcg)) {
    result[category] = convertGroupToLegacy(group);
  }
  
  return result;
}

/**
 * Convert a DTCG group to legacy format
 */
function convertGroupToLegacy(group: DTCGTokenGroup): TokenGroup {
  const result: TokenGroup = {};
  
  for (const [key, value] of Object.entries(group)) {
    if (isDTCGToken(value)) {
      result[key] = dtcgToLegacy(value);
    } else {
      result[key] = convertGroupToLegacy(value as DTCGTokenGroup);
    }
  }
  
  return result;
}

// ─── Token Resolver ──────────────────────────────────────────────────────────

/**
 * Token resolver - resolves token references and aliases
 * Supports both DTCG and legacy formats.
 */
export class TokenResolver {
  private dictionary: DesignTokenDictionary | DTCGDictionary;
  private cache = new Map<string, unknown>();
  private isDTCG: boolean;

  constructor(dictionary: DesignTokenDictionary | DTCGDictionary) {
    this.dictionary = dictionary;
    this.isDTCG = this.detectFormat(dictionary);
  }

  /**
   * Detect whether the dictionary is DTCG or legacy format
   */
  private detectFormat(dict: DesignTokenDictionary | DTCGDictionary): boolean {
    // Check the first leaf token
    for (const category of Object.values(dict)) {
      const found = this.findFirstToken(category);
      if (found) {
        return isDTCGToken(found);
      }
    }
    return false;
  }

  /**
   * Find the first token in a group (for format detection)
   */
  private findFirstToken(group: unknown): unknown {
    if (typeof group !== 'object' || group === null) return null;
    
    if (isDTCGToken(group) || isLegacyToken(group)) return group;
    
    for (const value of Object.values(group as Record<string, unknown>)) {
      const found = this.findFirstToken(value);
      if (found) return found;
    }
    
    return null;
  }

  /**
   * Resolve a token reference (e.g., "{color.primary.500}")
   */
  resolve(reference: string): unknown {
    if (this.cache.has(reference)) {
      return this.cache.get(reference);
    }

    const path = reference.replace(/^\{|\}$/g, '').split('.');
    
    let current: unknown = this.dictionary;
    for (const segment of path) {
      if (current && typeof current === 'object' && segment in current) {
        current = (current as Record<string, unknown>)[segment];
      } else {
        throw new Error(`Token reference not found: ${reference}`);
      }
    }

    // Extract value based on format
    let value: unknown;
    if (this.isDTCG && isDTCGToken(current)) {
      value = current.$value;
    } else if (isLegacyToken(current)) {
      value = current.value;
    } else {
      value = current;
    }
    
    // If value is a reference, resolve it recursively
    if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
      const resolved = this.resolve(value);
      this.cache.set(reference, resolved);
      return resolved;
    }

    this.cache.set(reference, value);
    return value;
  }

  /**
   * Resolve all tokens in the dictionary
   */
  resolveAll(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    this.resolveGroup(this.dictionary, '', result);
    return result;
  }

  /**
   * Resolve a group of tokens
   */
  private resolveGroup(group: unknown, prefix: string, result: Record<string, unknown>): void {
    if (typeof group !== 'object' || group === null) return;

    for (const [key, value] of Object.entries(group as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      
      if (this.isDTCG && isDTCGToken(value)) {
        result[path] = this.resolve(`{${path}}`);
      } else if (isLegacyToken(value)) {
        result[path] = value.value;
      } else {
        this.resolveGroup(value, path, result);
      }
    }
  }

  /**
   * Clear the resolution cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// ─── Default Token Set ───────────────────────────────────────────────────────

/**
 * Default design tokens in DTCG format
 */
export const DEFAULT_TOKENS_DTCG: DTCGDictionary = {
  color: {
    primary: {
      50: { $value: '#eff6ff', $type: 'color', $description: 'Primary 50' },
      100: { $value: '#dbeafe', $type: 'color', $description: 'Primary 100' },
      500: { $value: '#3b82f6', $type: 'color', $description: 'Primary 500' },
      600: { $value: '#2563eb', $type: 'color', $description: 'Primary 600' },
      700: { $value: '#1d4ed8', $type: 'color', $description: 'Primary 700' },
    },
    surface: {
      default: { $value: '#ffffff', $type: 'color', $description: 'Default surface' },
      elevated: { $value: '#f8fafc', $type: 'color', $description: 'Elevated surface' },
    },
    text: {
      primary: { $value: '#0f172a', $type: 'color', $description: 'Primary text' },
      secondary: { $value: '#475569', $type: 'color', $description: 'Secondary text' },
      disabled: { $value: '#94a3b8', $type: 'color', $description: 'Disabled text' },
    },
  },
  spacing: {
    xs: { $value: '4px', $type: 'dimension', $description: 'Extra small spacing' },
    sm: { $value: '8px', $type: 'dimension', $description: 'Small spacing' },
    md: { $value: '16px', $type: 'dimension', $description: 'Medium spacing' },
    lg: { $value: '24px', $type: 'dimension', $description: 'Large spacing' },
    xl: { $value: '32px', $type: 'dimension', $description: 'Extra large spacing' },
  },
  borderRadius: {
    sm: { $value: '4px', $type: 'borderRadius', $description: 'Small border radius' },
    md: { $value: '8px', $type: 'borderRadius', $description: 'Medium border radius' },
    lg: { $value: '12px', $type: 'borderRadius', $description: 'Large border radius' },
    full: { $value: '9999px', $type: 'borderRadius', $description: 'Full border radius' },
  },
  shadow: {
    sm: { $value: '0 1px 2px rgba(0,0,0,0.05)', $type: 'shadow', $description: 'Small shadow' },
    md: { $value: '0 4px 6px rgba(0,0,0,0.1)', $type: 'shadow', $description: 'Medium shadow' },
    lg: { $value: '0 10px 15px rgba(0,0,0,0.1)', $type: 'shadow', $description: 'Large shadow' },
  },
};

/**
 * Create a token resolver with the default token set
 */
export function createDefaultTokenResolver(): TokenResolver {
  return new TokenResolver(DEFAULT_TOKENS_DTCG);
}

export { collectTokenPaths, assertThemeParity } from './theme-parity';
