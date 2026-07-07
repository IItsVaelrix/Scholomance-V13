import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applySqlitePragmas, runSqliteMigrations } from './sqlite.migrations.js';
import { createDbWrapper } from './persistence.wrapper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..', '..');

const DB_PATH = process.env.DOWNLOADER_DB_PATH
  ? path.resolve(process.env.DOWNLOADER_DB_PATH)
  : path.join(ROOT, 'data', 'divtube_downloader.db');

const DOWNLOADER_DB_NAMESPACE = 'downloader';

function ensureDbDirectory() {
  const dir = path.dirname(DB_PATH);
  if (dir) {
    try {
      mkdirSync(dir, { recursive: true });
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  }
}

const DOWNLOADER_MIGRATIONS = [
  {
    version: 1,
    name: 'create_downloader_tables',
    up(dbLayer) {
      dbLayer.exec(`
        CREATE TABLE IF NOT EXISTS download_jobs (
          id TEXT PRIMARY KEY,
          url TEXT NOT NULL,
          title TEXT,
          channel TEXT,
          thumbnail TEXT,
          profile TEXT NOT NULL,
          format TEXT,
          status TEXT NOT NULL DEFAULT 'queued',
          progress_percent INTEGER DEFAULT 0,
          output_dir TEXT,
          error_message TEXT,
          error_code TEXT,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS download_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          job_id TEXT NOT NULL,
          status TEXT NOT NULL,
          progress_percent INTEGER DEFAULT 0,
          downloaded_bytes INTEGER,
          total_bytes INTEGER,
          speed_bytes_per_sec INTEGER,
          eta_seconds INTEGER,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(job_id) REFERENCES download_jobs(id) ON DELETE CASCADE
        );
      `);
    }
  }
];

let rawDb = null;
let db = null;

function initDownloaderDb() {
  if (db) return db;

  ensureDbDirectory();

  rawDb = new Database(DB_PATH, { verbose: process.env.DEBUG_SQLITE ? console.log : null });
  applySqlitePragmas(rawDb);
  runSqliteMigrations(rawDb, {
    namespace: DOWNLOADER_DB_NAMESPACE,
    migrations: DOWNLOADER_MIGRATIONS,
  });

  db = createDbWrapper({ type: 'better-sqlite3', db: rawDb });

  return db;
}

initDownloaderDb();

async function createJob(jobData) {
  await db.execute(`
    INSERT INTO download_jobs (
      id, url, title, channel, thumbnail, profile, format, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', datetime('now'), datetime('now'))
  `, [
    jobData.id,
    jobData.url,
    jobData.title || null,
    jobData.channel || null,
    jobData.thumbnail || null,
    jobData.profile,
    jobData.format || null
  ]);

  return getJob(jobData.id);
}

async function getJob(id) {
  const result = await db.execute('SELECT * FROM download_jobs WHERE id = ?', [id]);
  return result.rows[0] || null;
}

async function getAllJobs() {
  const result = await db.execute('SELECT * FROM download_jobs ORDER BY created_at DESC');
  return result.rows || [];
}

async function updateJob(id, updates) {
  const fields = [];
  const params = [];

  const ALLOWED_COLUMNS = [
    'title', 'channel', 'thumbnail', 'status', 'progress_percent', 'output_dir', 'error_message', 'error_code'
  ];

  for (const col of ALLOWED_COLUMNS) {
    if (updates[col] !== undefined) {
      fields.push(`${col} = ?`);
      params.push(updates[col]);
    }
  }

  if (fields.length === 0) return await getJob(id);

  fields.push("updated_at = datetime('now')");
  const query = `UPDATE download_jobs SET ${fields.join(', ')} WHERE id = ?`;
  params.push(id);

  await db.execute(query, params);
  return await getJob(id);
}

async function recordEvent(jobId, eventData) {
  await db.execute(`
    INSERT INTO download_events (
      job_id, status, progress_percent, downloaded_bytes, total_bytes, speed_bytes_per_sec, eta_seconds
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    jobId,
    eventData.status,
    eventData.progress_percent || 0,
    eventData.downloaded_bytes || null,
    eventData.total_bytes || null,
    eventData.speed_bytes_per_sec || null,
    eventData.eta_seconds || null
  ]);
}

async function getEvents(jobId) {
  const result = await db.execute('SELECT * FROM download_events WHERE job_id = ? ORDER BY created_at ASC', [jobId]);
  return result.rows || [];
}

export const downloaderPersistence = {
  createJob,
  getJob,
  getAllJobs,
  updateJob,
  recordEvent,
  getEvents
};
