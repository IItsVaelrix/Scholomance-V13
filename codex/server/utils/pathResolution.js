import path from 'node:path';
import { existsSync } from 'node:fs';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Resolve a SQLite database path for adapters.
 *
 * Priority:
 * 1. Explicit absolute path that exists on disk (honors SCHOLOMANCE_DICT_PATH=/app/data/...).
 * 2. In production, fall back to /var/data/<basename> then /app/<basename> when the
 *    configured path is missing (legacy Render/Fly volume layouts).
 * 3. Otherwise return the resolved configured path (caller handles missing files).
 *
 * Never override an existing explicit path with a stale volume copy — that made
 * Leximancy read a thin /var/data dict while lemma_form lived on the rich /app/data bake-in.
 */
export function resolveDatabasePath(rawPath, defaultBasename) {
  if (!rawPath && !defaultBasename) return null;

  const resolved = rawPath ? path.resolve(String(rawPath).trim()) : null;

  // Honor an explicit path that is already present (dev + prod bake-in).
  if (resolved && existsSync(resolved)) {
    return resolved;
  }

  if (IS_PRODUCTION) {
    const basename = resolved ? path.basename(resolved) : defaultBasename;

    const varDataPath = path.join('/var/data', basename);
    if (existsSync(varDataPath)) return varDataPath;

    const appDataPath = path.join('/app/data', basename);
    if (existsSync(appDataPath)) return appDataPath;

    const appPath = path.join('/app', basename);
    if (existsSync(appPath)) return appPath;

    // Absolute configured path missing — prefer the volume path for ritual seeding.
    if (resolved && path.isAbsolute(resolved)) {
      return varDataPath;
    }
  }

  return resolved ?? path.resolve(defaultBasename);
}
