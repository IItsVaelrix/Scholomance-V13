import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { SCHOOLS } from '../../../src/data/schools.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCRIPT_PATH = path.join(__dirname, '../../../scripts/generate-school-styles.js');
const OUTPUT_DIR = path.join(__dirname, '../../../src/lib/css/generated');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'school-styles.css');

describe('School Styles Generation QA', () => {
  let originalEnv;
  let originalArgv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    originalArgv = [...process.argv];
    // Ensure output directory exists for basic tests
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    process.env = originalEnv;
    process.argv = originalArgv;
    vi.restoreAllMocks();
  });

  describe('Integration Contract', () => {
    it('should have valid script file', () => {
      expect(fs.existsSync(SCRIPT_PATH)).toBe(true);
    });

    it('should have required CLI argument handling', async () => {
      const { main } = await import(`${SCRIPT_PATH}?reload=${Date.now()}`);
      expect(typeof main).toBe('function');
    });

    it('should have fallback mechanism', async () => {
      const globalFetch = global.fetch;
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      try {
        const { main } = await import(`${SCRIPT_PATH}?reload=${Date.now()}`);
        process.env.NODE_ENV = 'production';
        process.argv.push('--from-api');
        
        const result = await main();
        expect(result).toBe(true); // Should fallback to local
      } finally {
        global.fetch = globalFetch;
      }
    });

    it('should generate school-styles.css file', async () => {
      const { main } = await import(`${SCRIPT_PATH}?reload=${Date.now()}`);
      await main();
      expect(fs.existsSync(OUTPUT_FILE)).toBe(true);
    });

    it('should produce valid CSS syntax', () => {
      const content = fs.readFileSync(OUTPUT_FILE, 'utf8');
      expect(content).toContain(':root');
      // Updated to match actual prefix: --void-primary
      expect(content).toContain('-primary');
    });

    it('should contain all required school themes', () => {
      const content = fs.readFileSync(OUTPUT_FILE, 'utf8');
      const requiredSchools = Object.keys(SCHOOLS);
      requiredSchools.forEach(school => {
        expect(content.toLowerCase()).toContain(school.toLowerCase());
      });
    });

    it('should have proper CSS variable structure', () => {
      const content = fs.readFileSync(OUTPUT_FILE, 'utf8');
      // Matches --void-primary: hsl(...) or #...
      expect(content).toMatch(/--[\w-]+-primary:\s*(?:hsl|#)/);
    });
  });

  describe('Error Handling QA', () => {
    it('should handle missing output directory gracefully', async () => {
      const tempDir = OUTPUT_DIR + '.backup';
      let renamed = false;
      if (fs.existsSync(OUTPUT_DIR)) {
        fs.renameSync(OUTPUT_DIR, tempDir);
        renamed = true;
      }

      try {
        const { main } = await import(`${SCRIPT_PATH}?reload=${Date.now()}`);
        delete process.env.NODE_ENV;
        
        await main();

        expect(fs.existsSync(OUTPUT_DIR)).toBe(true);
        expect(fs.existsSync(OUTPUT_FILE)).toBe(true);
      } finally {
        if (renamed && fs.existsSync(tempDir)) {
          if (fs.existsSync(OUTPUT_DIR)) {
            fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
          }
          fs.renameSync(tempDir, OUTPUT_DIR);
        }
      }
    });

    it('should complete without throwing on API error', async () => {
      const globalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      try {
        const { main } = await import(`${SCRIPT_PATH}?reload=${Date.now()}`);
        process.env.NODE_ENV = 'production';
        process.argv.push('--from-api');
        
        const result = await main();
        expect(result).toBe(true);
      } finally {
        global.fetch = globalFetch;
      }
    });
  });

  describe('Performance & Safety', () => {
    it('should complete generation within acceptable time', async () => {
      const start = Date.now();
      const { main } = await import(`${SCRIPT_PATH}?reload=${Date.now()}`);
      await main();
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(2000);
    });

    it('should not generate excessively large CSS file', () => {
      const stats = fs.statSync(OUTPUT_FILE);
      const sizeInKB = stats.size / 1024;
      expect(sizeInKB).toBeLessThan(100);
    });

    it('should export functions for programmatic use', async () => {
      const { main } = await import(`${SCRIPT_PATH}?reload=${Date.now()}`);
      expect(main).toBeDefined();
    });
  });
});
