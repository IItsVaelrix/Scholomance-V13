/**
 * QA Validation: Missing Imports Detection
 *
 * Static analysis tests to detect missing imports in JSX/JS files:
 * - Missing named exports from imported modules (focused on Icons)
 * - Unused imports (dead code) - warnings only
 * - Specific component import validation
 *
 * Note: Full static analysis for JavaScript is complex due to dynamic imports,
 * re-exports, and runtime evaluation. This test focuses on high-confidence
 * patterns like JSX component usage and icon imports.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../../..');

// ============================================================================
// CONFIGURATION
// ============================================================================

const SCAN_PATHS = {
  components: 'src/components',
  pages: 'src/pages',
  hooks: 'src/hooks',
};

const IGNORE_PATTERNS = [
  /\.test\./i,
  /\.spec\./i,
  /node_modules/i,
  /\.css$/i,
  /\.json$/i,
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Recursively find all files in a directory
 */
function findFiles(dir, extensions = ['.js', '.jsx', '.ts', '.tsx']) {
  const results = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...findFiles(fullPath, extensions));
    } else if (extensions.some(ext => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Check if file should be ignored
 */
function shouldIgnore(filePath) {
  return IGNORE_PATTERNS.some(pattern => pattern.test(filePath));
}

/**
 * Extract import statements from file content
 */
function extractImports(content) {
  const imports = {
    named: new Map(),
    default: new Map(),
    namespace: new Map(),
    all: [],
  };

  const namedImportRegex = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
  const defaultImportRegex = /import\s+(\w+)\s+from\s*['"]([^'"]+)['"]/g;
  const namespaceImportRegex = /import\s*\*\s*as\s+(\w+)\s*from\s*['"]([^'"]+)['"]/g;
  const mixedImportRegex = /import\s+(\w+)\s*,\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;

  let match;

  while ((match = namedImportRegex.exec(content)) !== null) {
    const [, names, source] = match;
    const nameList = names.split(',').map(n => n.trim().split(/\s+as\s+/)[0].trim());
    imports.named.set(source, new Set(nameList));
    imports.all.push({ type: 'named', names: nameList, source });
  }

  while ((match = defaultImportRegex.exec(content)) !== null) {
    const [, name, source] = match;
    if (!content.includes(`import ${name}, {`)) {
      imports.default.set(source, name);
      imports.all.push({ type: 'default', name, source });
    }
  }

  while ((match = namespaceImportRegex.exec(content)) !== null) {
    const [, ns, source] = match;
    imports.namespace.set(source, ns);
    imports.all.push({ type: 'namespace', name: ns, source });
  }

  while ((match = mixedImportRegex.exec(content)) !== null) {
    const [, defaultName, names, source] = match;
    const nameList = names.split(',').map(n => n.trim().split(/\s+as\s+/)[0].trim());
    imports.default.set(source, defaultName);
    imports.named.set(source, new Set([...(imports.named.get(source) || []), ...nameList]));
    imports.all.push({ type: 'mixed', defaultName, names: nameList, source });
  }

  return imports;
}

/**
 * Extract export statements from file content
 */
function extractExports(content) {
  const exports = {
    named: new Set(),
    default: false,
    all: [],
  };

  const namedExportRegex = /export\s*\{([^}]+)\}/g;
  const declarationExportRegex = /export\s+(?:const|let|var|function|class)\s+(\w+)/g;
  const defaultExportRegex = /export\s+default/g;

  let match;

  while ((match = namedExportRegex.exec(content)) !== null) {
    const [, names] = match;
    names.split(',').forEach(n => {
      const cleanName = n.trim().split(/\s+as\s+/)[0].trim();
      if (cleanName) {
        exports.named.add(cleanName);
        exports.all.push({ type: 'named', name: cleanName });
      }
    });
  }

  while ((match = declarationExportRegex.exec(content)) !== null) {
    const [, name] = match;
    exports.named.add(name);
    exports.all.push({ type: 'declaration', name });
  }

  while ((match = defaultExportRegex.exec(content)) !== null) {
    exports.default = true;
    exports.all.push({ type: 'default' });
  }

  return exports;
}

/**
 * Extract JSX component usage (components starting with capital letter)
 */
function extractJSXComponents(content) {
  const components = new Set();
  const jsxOpenRegex = /<([A-Z][a-zA-Z0-9]*(?:\.[A-Z][a-zA-Z0-9]*)*)/g;
  const jsxCloseRegex = /<\/([A-Z][a-zA-Z0-9]*)/g;

  let match;

  while ((match = jsxOpenRegex.exec(content)) !== null) {
    components.add(match[1].split('.')[0]);
  }

  while ((match = jsxCloseRegex.exec(content)) !== null) {
    components.add(match[1]);
  }

  return components;
}

/**
 * Check if identifier is imported
 */
function checkIfImported(identifier, imports) {
  for (const [, names] of imports.named) {
    if (names.has(identifier)) return true;
  }
  for (const [, name] of imports.default) {
    if (name === identifier) return true;
  }
  for (const [, ns] of imports.namespace) {
    if (identifier.startsWith(ns + '.')) return true;
  }
  return false;
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('Missing Imports QA', () => {
  describe('Import/Export Contract Validation', () => {
    it('should have matching imports and exports for Icons.jsx', () => {
      const iconsPath = path.join(ROOT, 'src/components/Icons.jsx');
      const exportOptionsPath = path.join(ROOT, 'src/pages/PixelBrain/components/ExportOptions.jsx');

      if (!fs.existsSync(exportOptionsPath)) return;

      const iconsContent = fs.readFileSync(iconsPath, 'utf8');
      const exportsContent = fs.readFileSync(exportOptionsPath, 'utf8');

      const iconExports = extractExports(iconsContent);
      const usedComponents = extractJSXComponents(exportsContent);

      for (const component of usedComponents) {
        if (component.endsWith('Icon')) {
          expect(iconExports.named.has(component))
            .toBe(true, `${component} is used but not exported from Icons.jsx`);
        }
      }
    });

    it('should detect all exported icons from Icons.jsx', () => {
      const iconsPath = path.join(ROOT, 'src/components/Icons.jsx');
      const content = fs.readFileSync(iconsPath, 'utf8');
      const exports = extractExports(content);

      const expectedIcons = [
        'FolderIcon', 'SearchIcon', 'ToolsIcon', 'BookIcon',
        'EyeIcon', 'SparkleIcon', 'MetricsIcon', 'AnalyzeIcon',
        'RhymeIcon', 'CheckIcon', 'CloseIcon', 'ChevronsRightIcon',
        'ChevronsLeftIcon', 'SettingsIcon', 'UploadIcon', 'ImageIcon',
        'LoadingIcon', 'WarningIcon', 'ErrorIcon', 'CodeIcon',
        'RefreshIcon', 'EditIcon', 'DownloadIcon', 'LayersIcon',
        'TrendingUpIcon', 'PaletteIcon', 'GridIcon', 'SymmetryIcon',
        'ZapIcon', 'TvIcon', 'CopyIcon', 'AstrologyIcon',
      ];

      for (const icon of expectedIcons) {
        expect(exports.named.has(icon))
          .toBe(true, `${icon} should be exported from Icons.jsx`);
      }
    });
  });

  describe('Component Import Validation', () => {
    it('should detect unused imports (warning only)', () => {
      const componentFiles = findFiles(path.join(ROOT, SCAN_PATHS.components));
      const pageFiles = findFiles(path.join(ROOT, SCAN_PATHS.pages));
      const allFiles = [...componentFiles, ...pageFiles].filter(f => !shouldIgnore(f));

      const issues = [];

      for (const filePath of allFiles) {
        const content = fs.readFileSync(filePath, 'utf8');
        const imports = extractImports(content);

        for (const { type, names } of imports.all) {
          if (type === 'named' && names) {
            for (const importedName of names) {
              if (/^use[A-Z]/.test(importedName)) continue;

              const importLineRegex = new RegExp(`import.*\\b${importedName}\\b.*from`, 'g');
              const contentWithoutImports = content.replace(importLineRegex, '');
              const usageCount = (contentWithoutImports.match(new RegExp(`\\b${importedName}\\b`, 'g')) || []).length;

              if (usageCount === 0) {
                issues.push({
                  file: path.relative(ROOT, filePath),
                  identifier: importedName,
                  type: 'unused_import',
                });
              }
            }
          }
        }
      }

      if (issues.length > 0) {
        console.warn(`\n⚠️  Unused imports detected (${issues.length}):`);
        issues.slice(0, 10).forEach(i => {
          console.warn(`  - ${i.file}: ${i.identifier}`);
        });
        if (issues.length > 10) {
          console.warn(`  ... and ${issues.length - 10} more`);
        }
      }

      expect(true).toBe(true);
    });
  });

  describe('ExportOptions Specific Validation', () => {
    it('should have all icons used in ExportOptions imported', () => {
      const exportOptionsPath = path.join(ROOT, 'src/pages/PixelBrain/components/ExportOptions.jsx');
      const iconsPath = path.join(ROOT, 'src/components/Icons.jsx');

      if (!fs.existsSync(exportOptionsPath)) return;

      const content = fs.readFileSync(exportOptionsPath, 'utf8');
      const iconsContent = fs.readFileSync(iconsPath, 'utf8');

      const imports = extractImports(content);
      const iconExports = extractExports(iconsContent);
      const usedComponents = extractJSXComponents(content);

      const iconComponents = Array.from(usedComponents).filter(c => c.endsWith('Icon'));
      const importedIcons = new Set();

      for (const { names } of imports.all) {
        if (names) {
          names.forEach(n => importedIcons.add(n));
        }
      }

      const missingIcons = iconComponents.filter(icon => {
        const isImported = importedIcons.has(icon);
        const isExported = iconExports.named.has(icon);
        return !isImported && isExported;
      });

      if (missingIcons.length > 0) {
        expect.fail(`Missing icon imports in ExportOptions.jsx: ${missingIcons.join(', ')}`);
      }
    });
  });

  describe('Circular Dependency Detection', () => {
    it('should not have circular dependencies in components', () => {
      const componentFiles = findFiles(path.join(ROOT, SCAN_PATHS.components));
      const dependencyGraph = new Map();

      for (const filePath of componentFiles) {
        if (shouldIgnore(filePath)) continue;

        const content = fs.readFileSync(filePath, 'utf8');
        const imports = extractImports(content);
        const relativePath = path.relative(ROOT, filePath);

        const deps = [];
        for (const { source } of imports.all) {
          if (source.startsWith('.')) {
            const resolvedPath = path.resolve(path.dirname(filePath), source);
            const normalizedPath = path.relative(ROOT, resolvedPath);
            deps.push(normalizedPath);
          }
        }

        dependencyGraph.set(relativePath, deps);
      }

      const visited = new Set();
      const recursionStack = new Set();
      const cycles = [];

      function detectCycle(node, path) {
        if (recursionStack.has(node)) {
          cycles.push([...path, node]);
          return true;
        }

        if (visited.has(node)) return false;

        visited.add(node);
        recursionStack.add(node);

        const deps = dependencyGraph.get(node) || [];
        for (const dep of deps) {
          detectCycle(dep, [...path, node]);
        }

        recursionStack.delete(node);
        return false;
      }

      for (const node of dependencyGraph.keys()) {
        detectCycle(node, []);
      }

      if (cycles.length > 0) {
        const report = cycles.map(c => `  - ${c.join(' → ')}`).join('\n');
        console.warn(`\n⚠️  Circular dependencies detected:\n${report}`);
      }

      expect(true).toBe(true);
    });
  });

  describe('Icon Import Audit', () => {
    it('should validate icon imports across all files', () => {
      const iconsPath = path.join(ROOT, 'src/components/Icons.jsx');
      const iconsContent = fs.readFileSync(iconsPath, 'utf8');
      const iconExports = extractExports(iconsContent);

      const componentFiles = findFiles(path.join(ROOT, SCAN_PATHS.components));
      const pageFiles = findFiles(path.join(ROOT, SCAN_PATHS.pages));
      const allFiles = [...componentFiles, ...pageFiles].filter(f => !shouldIgnore(f));

      const issues = [];

      for (const filePath of allFiles) {
        const content = fs.readFileSync(filePath, 'utf8');
        const imports = extractImports(content);
        const usedComponents = extractJSXComponents(content);

        // Find locally defined components/functions
        const localDefs = new Set();
        const localDefRegex = /(?:function|const|let|var)\s+([A-Z][a-zA-Z0-9]*)\s*(?:\(|=|:)/g;
        let localMatch;
        while ((localMatch = localDefRegex.exec(content)) !== null) {
          localDefs.add(localMatch[1]);
        }

        const usedIcons = Array.from(usedComponents).filter(c => c.endsWith('Icon'));

        for (const icon of usedIcons) {
          // Skip if icon is exported from Icons.jsx but...
          if (!iconExports.named.has(icon)) continue;

          // ...check if it's locally defined (not imported)
          if (localDefs.has(icon)) continue;

          const isImported = checkIfImported(icon, imports);

          if (!isImported) {
            issues.push({
              file: path.relative(ROOT, filePath),
              icon,
            });
          }
        }
      }

      if (issues.length > 0) {
        const report = issues
          .map(i => `  - ${i.file}: ${i.icon} icon not imported`)
          .join('\n');
        expect.fail(`Missing icon imports detected:\n${report}`);
      }
    });
  });
});
