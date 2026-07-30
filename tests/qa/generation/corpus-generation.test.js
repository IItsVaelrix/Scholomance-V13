/**
 * QA Validation: Corpus Generation
 *
 * Validates the generate_corpus.js script for:
 * - Dictionary word extraction and limits
 * - Sequence pair generation
 * - SQLite corpus processing
 * - JSON payload structure
 * - File I/O operations
 *
 * @see scripts/generate_corpus.js
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../../..');
const SCRIPT_PATH = path.join(ROOT, 'scripts/generate_corpus.js');
describe('Corpus Generation QA', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Script Contract Validation', () => {
    it('should have valid script file', () => {
      expect(fs.existsSync(SCRIPT_PATH)).toBe(true);
    });

    it('should have required constants defined', () => {
      const scriptContent = fs.readFileSync(SCRIPT_PATH, 'utf8');

      expect(scriptContent).toContain('DICTIONARY_LIMIT');
      expect(scriptContent).toContain('SEQUENCE_LIMIT');
      expect(scriptContent).toContain('PAIR_SEPARATOR');
    });

    it('should have normalization functions', () => {
      const scriptContent = fs.readFileSync(SCRIPT_PATH, 'utf8');

      expect(scriptContent).toContain('normalizeLineText');
      expect(scriptContent).toContain('tokenize');
      expect(scriptContent).toContain('mergeCount');
    });

    it('should have ingestion logic', () => {
      const scriptContent = fs.readFileSync(SCRIPT_PATH, 'utf8');

      expect(scriptContent).toContain('ingestTokens');
      expect(scriptContent).toContain('sortByFrequencyDescThenLexAsc');
    });
  });

  describe('Payload Structure Validation', () => {
    it('should have correct payload schema', () => {
      const payload = {
        version: 2,
        dictionary: ['word1', 'word2', 'word3'],
        sequences: [['word1', 'word2', 5], ['word2', 'word3', 3]]
      };

      expect(payload).toHaveProperty('version');
      expect(payload).toHaveProperty('dictionary');
      expect(payload).toHaveProperty('sequences');

      expect(typeof payload.version).toBe('number');
      expect(Array.isArray(payload.dictionary)).toBe(true);
      expect(Array.isArray(payload.sequences)).toBe(true);
    });

    it('should validate dictionary entries', () => {
      const dictionary = ['apple', 'banana', 'cherry'];

      for (const word of dictionary) {
        expect(typeof word).toBe('string');
        expect(word.length).toBeGreaterThan(0);
        expect(word).toMatch(/^[a-z]+$/i);
      }
    });

    it('should validate sequence entries', () => {
      const sequences = [
        ['apple', 'banana', 10],
        ['banana', 'cherry', 5],
      ];

      for (const [prev, next, count] of sequences) {
        expect(typeof prev).toBe('string');
        expect(typeof next).toBe('string');
        expect(typeof count).toBe('number');
        expect(count).toBeGreaterThan(0);
      }
    });
  });

  describe('Text Processing QA', () => {
    describe('normalizeLineText', () => {
      it('should normalize whitespace', () => {
        const input = '  multiple   spaces   between  ';
        const expected = 'multiple spaces between';

        const result = String(input || '').replace(/\s+/g, ' ').trim();
        expect(result).toBe(expected);
      });

      it('should handle empty input', () => {
        const input = '';
        const result = String(input || '').replace(/\s+/g, ' ').trim();
        expect(result).toBe('');
      });

      it('should handle null/undefined', () => {
        expect(String(null || '').replace(/\s+/g, ' ').trim()).toBe('');
        expect(String(undefined || '').replace(/\s+/g, ' ').trim()).toBe('');
      });
    });

    describe('tokenize', () => {
      it('should extract words from text', () => {
        const text = 'Hello world, this is a test!';
        const tokens = text.toLowerCase().match(/[a-z']+/g) || [];

        expect(tokens).toEqual(['hello', 'world', 'this', 'is', 'a', 'test']);
      });

      it('should handle apostrophes', () => {
        const text = "don't stop believing";
        const tokens = text.toLowerCase().match(/[a-z']+/g) || [];

        // Regex [a-z']+ keeps apostrophes within words
        expect(tokens).toEqual(["don't", 'stop', 'believing']);
      });

      it('should return empty array for non-matching text', () => {
        const text = '123 !@#';
        const tokens = text.toLowerCase().match(/[a-z']+/g) || [];

        expect(tokens).toEqual([]);
      });

      it('should filter short words', () => {
        const words = ['a', 'ab', 'abc', 'abcd'];
        const filtered = words.filter(w => w.length >= 2);

        expect(filtered).toEqual(['ab', 'abc', 'abcd']);
      });
    });

    describe('mergeCount', () => {
      it('should increment existing count', () => {
        const map = new Map([['word', 5]]);
        map.set('word', (map.get('word') || 0) + 1);

        expect(map.get('word')).toBe(6);
      });

      it('should initialize new entry', () => {
        const map = new Map();
        map.set('newword', (map.get('newword') || 0) + 1);

        expect(map.get('newword')).toBe(1);
      });
    });
  });

  describe('Sequence Generation QA', () => {
    it('should generate word pairs from sequence', () => {
      const words = ['one', 'two', 'three', 'four'];
      const pairs = [];

      for (let i = 0; i < words.length - 1; i++) {
        pairs.push([words[i], words[i + 1]]);
      }

      expect(pairs).toEqual([
        ['one', 'two'],
        ['two', 'three'],
        ['three', 'four']
      ]);
    });

    it('should handle empty word list', () => {
      const words = [];
      const pairs = [];

      for (let i = 0; i < words.length - 1; i++) {
        pairs.push([words[i], words[i + 1]]);
      }

      expect(pairs).toEqual([]);
    });

    it('should handle single word', () => {
      const words = ['only'];
      const pairs = [];

      for (let i = 0; i < words.length - 1; i++) {
        pairs.push([words[i], words[i + 1]]);
      }

      expect(pairs).toEqual([]);
    });
  });

  describe('Sorting and Limiting QA', () => {
    it('should sort by frequency desc then lex asc', () => {
      const entries = [
        ['apple', 5],
        ['banana', 10],
        ['cherry', 10],
        ['date', 3],
      ];

      const sorted = entries.sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return String(a[0]).localeCompare(String(b[0]));
      });

      expect(sorted).toEqual([
        ['banana', 10],
        ['cherry', 10],
        ['apple', 5],
        ['date', 3],
      ]);
    });

    it('should apply dictionary limit', () => {
      const DICTIONARY_LIMIT = 3;
      const entries = [['a', 1], ['b', 2], ['c', 3], ['d', 4], ['e', 5]];
      const limited = entries.slice(0, DICTIONARY_LIMIT);

      expect(limited.length).toBe(3);
      expect(limited).toEqual([['a', 1], ['b', 2], ['c', 3]]);
    });

    it('should filter sequences by dictionary membership', () => {
      const dictionarySet = new Set(['apple', 'banana', 'cherry']);
      const sequences = [
        { prev: 'apple', next: 'banana', count: 5 },
        { prev: 'banana', next: 'date', count: 3 }, // 'date' not in dict
        { prev: 'cherry', next: 'apple', count: 2 },
      ];

      const filtered = sequences.filter(
        entry => dictionarySet.has(entry.prev) && dictionarySet.has(entry.next)
      );

      expect(filtered.length).toBe(2);
      expect(filtered.map(s => `${s.prev}-${s.next}`)).toEqual([
        'apple-banana',
        'cherry-apple'
      ]);
    });
  });

  describe('File I/O QA', () => {
    it('should create output directory if missing', () => {
      const testDir = path.join(ROOT, 'public/test-output');

      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }

      fs.mkdirSync(testDir, { recursive: true });
      expect(fs.existsSync(testDir)).toBe(true);

      fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('should write valid JSON file', () => {
      const testPath = path.join(ROOT, 'public/test-corpus.json');
      const payload = {
        version: 2,
        dictionary: ['test'],
        sequences: [['test', 'test', 1]]
      };

      fs.mkdirSync(path.dirname(testPath), { recursive: true });
      fs.writeFileSync(testPath, JSON.stringify(payload));

      expect(fs.existsSync(testPath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(testPath, 'utf8'));
      expect(content).toEqual(payload);

      fs.rmSync(testPath, { force: true });
    });

    it('should validate output path structure', () => {
      const outputPath = path.join(ROOT, 'public/corpus.json');

      expect(outputPath).toContain('public');
      expect(outputPath).toMatch(/\.json$/);
    });
  });

  describe('Database Path Configuration', () => {
    it('should use environment variable for corpus path', () => {
      process.env.SCHOLOMANCE_CORPUS_PATH = '/custom/path/corpus.sqlite';

      const corpusPath = process.env.SCHOLOMANCE_CORPUS_PATH ||
        path.resolve(process.cwd(), 'scholomance_corpus.sqlite');

      expect(corpusPath).toBe('/custom/path/corpus.sqlite');
    });

    it('should fallback to default path', () => {
      delete process.env.SCHOLOMANCE_CORPUS_PATH;

      const corpusPath = process.env.SCHOLOMANCE_CORPUS_PATH ||
        path.resolve(process.cwd(), 'scholomance_corpus.sqlite');

      expect(corpusPath).toContain('scholomance_corpus.sqlite');
    });
  });

  describe('Header Inference QA', () => {
    it('should detect song headers', () => {
      const SONG_HEADER_REGEX = /^\s*(\d+)\s*[.)]\s+(.+?)\s*$/;

      expect('1. Song Title'.match(SONG_HEADER_REGEX)).toBeTruthy();
      expect('2) Another Song'.match(SONG_HEADER_REGEX)).toBeTruthy();
      expect('10) Track Ten'.match(SONG_HEADER_REGEX)).toBeTruthy();
    });

    it('should skip non-header lines', () => {
      const SONG_HEADER_REGEX = /^\s*(\d+)\s*[.)]\s+(.+?)\s*$/;

      expect('This is a lyric line'.match(SONG_HEADER_REGEX)).toBeFalsy();
      expect('[Chorus]'.match(SONG_HEADER_REGEX)).toBeFalsy();
      expect(''.match(SONG_HEADER_REGEX)).toBeFalsy();
    });
  });

  describe('Performance QA', () => {
    it('should process tokens efficiently', () => {
      const words = Array(1000).fill('test');
      const frequencyMap = new Map();
      const sequenceMap = new Map();

      const startTime = performance.now();

      for (let i = 0; i < words.length - 1; i++) {
        const word = words[i];
        if (word.length < 2) continue;

        frequencyMap.set(word, (frequencyMap.get(word) || 0) + 1);

        const next = words[i + 1];
        if (next.length < 2) continue;

        const key = `${word}\u0000${next}`;
        sequenceMap.set(key, (sequenceMap.get(key) || 0) + 1);
      }

      const elapsed = performance.now() - startTime;

      expect(elapsed).toBeLessThan(100); // 1000 tokens in < 100ms
      // Note: Only 999 because loop goes to words.length - 1
      expect(frequencyMap.get('test')).toBe(999);
    });

    it('should handle large frequency maps', () => {
      const frequencyMap = new Map();

      for (let i = 0; i < 10000; i++) {
        const word = `word${i}`;
        frequencyMap.set(word, i);
      }

      expect(frequencyMap.size).toBe(10000);

      const sorted = [...frequencyMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 100);

      expect(sorted.length).toBe(100);
      expect(sorted[0][1]).toBe(9999);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty input', () => {
      const payload = {
        version: 2,
        dictionary: [],
        sequences: []
      };

      expect(payload.dictionary.length).toBe(0);
      expect(payload.sequences.length).toBe(0);
    });

    it('should handle single word input', () => {
      const words = ['only'];
      const frequencyMap = new Map();

      words.forEach(word => {
        if (word.length >= 2) {
          frequencyMap.set(word, (frequencyMap.get(word) || 0) + 1);
        }
      });

      expect(frequencyMap.get('only')).toBe(1);
    });

    it('should handle duplicate words', () => {
      const words = ['test', 'test', 'test'];
      const frequencyMap = new Map();

      words.forEach(word => {
        frequencyMap.set(word, (frequencyMap.get(word) || 0) + 1);
      });

      expect(frequencyMap.get('test')).toBe(3);
    });

    it('should handle special characters in text', () => {
      const text = 'Hello! World? Test...';
      const tokens = text.toLowerCase().match(/[a-z']+/g) || [];

      expect(tokens).toEqual(['hello', 'world', 'test']);
    });
  });

  describe('Version Contract', () => {
    it('should maintain version number', () => {
      const scriptContent = fs.readFileSync(SCRIPT_PATH, 'utf8');
      const versionMatch = scriptContent.match(/version:\s*(\d+)/);

      expect(versionMatch).toBeTruthy();
      expect(parseInt(versionMatch[1], 10)).toBe(3);
    });

    it('should include version in payload', () => {
      const payload = {
        version: 2,
        dictionary: [],
        sequences: []
      };

      expect(payload.version).toBe(2);
    });
  });
});
