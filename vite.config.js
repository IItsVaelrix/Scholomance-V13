/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import os from 'node:os'

/**
 * Test runs yield the CPU to whoever is using the machine.
 *
 * The worker cap below limits HOW MANY threads a run takes; this limits their
 * PRIORITY, which is the half that keeps the desktop responsive when a run is
 * unavoidably heavy. Workers are spawned from this process and inherit its nice
 * value, so setting it once here covers every entry point — npm scripts, a bare
 * `npx vitest`, an IDE runner, and `scripts/perturbation-probe.mjs`, which shells
 * out to vitest hundreds of times in a row.
 *
 * GUARDED ON `VITEST` ON PURPOSE. This config also serves `vite dev` and
 * `vite build`; renicing those would make the dev server sluggish, which is the
 * exact problem this is meant to fix, aimed at the wrong target.
 *
 * Lowering priority never requires privileges; raising it does. Wrapped anyway,
 * because a platform that refuses should cost us responsiveness, not the run.
 */
if (process.env.VITEST) {
  try {
    os.setPriority(0, 19)
  } catch (error) {
    // Loudly, not silently. A swallowed failure here leaves the run at full
    // priority while this file claims otherwise — the comment becomes the lie.
    console.warn(`[vitest] could not lower process priority (${error.message}) — tests will compete with the desktop`)
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
const env = loadEnv(mode, process.cwd(), '')
return {
  plugins: [react()],
  resolve: {
    // Prevent multiple React copies (common with Rete.js, Three Fiber, Lexical, etc.)
    // This fixes "Invalid hook call" and "Cannot read properties of null (reading 'useState')"
    dedupe: ['react', 'react-dom'],
  },
  worker: {
    format: 'es',
  },
  css: {
    transformer: 'lightningcss',
    lightningcss: {
      drafts: {
        customMedia: true,
      },
    },
  },
  // Exclude Node.js-only packages from the browser bundle. @sqlite.org/sqlite-wasm
  // is excluded for a different reason: its glue locates the engine via
  // `new URL("sqlite3.wasm", import.meta.url)`, which Vite's own asset pipeline
  // rewrites correctly ONLY when the dep is not pre-bundled by esbuild. Without
  // this the Career Graph worker's SQLite init 404s on sqlite3.wasm.
  optimizeDeps: {
    exclude: ['cmudict', 'better-sqlite3', 'bcrypt', '@sqlite.org/sqlite-wasm'],
  },
  build: {
    cssMinify: 'lightningcss',
    rollupOptions: {
      external: ['cmudict', 'better-sqlite3', 'bcrypt'],
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '^/auth/.*': { target: 'http://localhost:8080' },
      '^/collab/.*': { target: 'http://localhost:8080' },
      // Subtlety APM browser crash lane: inject the ingest token server-side
      // so the client sensor can post without a secret in the bundle.
      '^/subtlety/.*': {
        target: 'http://localhost:8080',
        ...(env.SUBTLETY_INGEST_TOKEN
          ? { headers: { 'x-subtlety-token': env.SUBTLETY_INGEST_TOKEN } }
          : {}),
      },
      // Backend owns uploaded archive tracks under /audio/*, but static files
      // in public/audio/ (ambience, scholosound) must be served by Vite.
      '/audio': {
        target: 'http://localhost:8080',
        bypass(req) {
          const url = req.url || '';
          if (
            url.startsWith('/audio/ambience/')
            || url.startsWith('/audio/scholosound/')
          ) {
            return url;
          }
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.js',
    /**
     * WORKER CAP — the dev machine is a Steam Deck, and this is not a taste preference.
     *
     * Vitest defaults to one worker per core. On an APU where the CPU and GPU share a
     * single TDP budget, taking all 8 threads starves the compositor: the whole desktop
     * stalls, not just the terminal. Measured after ONE uncapped `vitest run tests/lib`:
     * loadavg 20.68 on 8 cores. `--coverage` (v8) multiplies it further, and
     * `scripts/perturbation-probe.mjs` spawns a fresh vitest per mutant — hundreds of
     * uncapped full-core runs back to back.
     *
     * Two of eight leaves six threads for the machine's owner to keep using their
     * machine. CI, which owns its box and has nothing to starve, raises it with
     * VITEST_MAX_WORKERS — set it there rather than removing this default, because the
     * default is what protects the interactive case.
     */
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS) || 2,
    include: ['tests/**/*.{test,spec}.{js,jsx,ts,tsx}', 'src/ui/animation/**/__tests__/*.{test,spec}.{js,jsx,ts,tsx}', 'src/pages/Listen/**/__tests__/*.{test,spec}.{js,jsx,ts,tsx}', '*.{test,spec}.{js,jsx,ts,tsx}'],
    // tests/e2e/** and tests/perf/** are Playwright suites (run via
    // `npm run test:e2e` / playwright.config.js). Their .spec.ts files match
    // the include glob above, and vitest collecting them fails the run with
    // "Playwright Test did not expect test() to be called here".
    exclude: ['**/tests/visual/**', '**/node_modules/**', 'tests/qa/e2e/**', 'tests/e2e/**', 'tests/perf/**', 'tests/qa/immunity.*.test.js', 'debug_*.test.js', 'phoneme.accuracy.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**'],
      exclude: ['tests/**'],
    },
  },
}
})
