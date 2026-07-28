/**
 * Polaris OS Server — entry point
 *
 * Fastify + WebSocket authoritative game server.
 * Milestone 3 implementation: realtime multiplayer over the deterministic kernel.
 */

import { resolve, dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { buildGameServer } from "./GameServer.js";
import { resolveDefaultWorldpackDir } from "./loadWorldpack.js";

const worldpackDir =
  process.env.WORLDPACK_DIR ?? resolveDefaultWorldpackDir();
const dbPath = process.env.DB_PATH ?? resolve(process.cwd(), "data/codex_vale.sqlite");
const port = Number(process.env.PORT ?? 3100);

// Ensure the SQLite directory exists (better-sqlite3 won't create parents).
mkdirSync(dirname(dbPath), { recursive: true });

const server = await buildGameServer({ worldpackDir, dbPath, logger: true });
const actualPort = await server.start(port);
console.log(`[polaris-server] world=${server.getWorldId()} listening on :${actualPort}`);
