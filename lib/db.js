'use strict';
// Persistent storage using Node.js built-in node:sqlite
// Database stored at ~/.local/share/savetokens/events.db

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DB_DIR = path.join(os.homedir(), '.local', 'share', 'savetokens');
const DB_PATH = path.join(DB_DIR, 'events.db');

let db;

function getDb() {
  if (db) return db;
  fs.mkdirSync(DB_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      ts        TEXT NOT NULL,
      command   TEXT NOT NULL,
      argv      TEXT NOT NULL,
      orig_bytes  INTEGER NOT NULL,
      comp_bytes  INTEGER NOT NULL,
      orig_tokens INTEGER NOT NULL,
      comp_tokens INTEGER NOT NULL,
      saved_tokens INTEGER NOT NULL,
      saved_pct   REAL NOT NULL,
      duration_ms INTEGER NOT NULL,
      cwd       TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
  `);
  return db;
}

function insertEvent(ev) {
  const d = getDb();
  const stmt = d.prepare(`
    INSERT INTO events
      (ts, command, argv, orig_bytes, comp_bytes, orig_tokens, comp_tokens, saved_tokens, saved_pct, duration_ms, cwd)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `);
  return stmt.run(
    ev.ts, ev.command, ev.argv,
    ev.origBytes, ev.compBytes,
    ev.origTokens, ev.compTokens,
    ev.savedTokens, ev.savedPct,
    ev.durationMs, ev.cwd
  );
}

function getRecentEvents(limit = 200) {
  const d = getDb();
  const rows = d.prepare(
    'SELECT * FROM events ORDER BY id DESC LIMIT ?'
  ).all(limit);
  return rows;
}

function getStats() {
  const d = getDb();
  const total = d.prepare(`
    SELECT
      COUNT(*) as calls,
      COALESCE(SUM(orig_tokens),0) as orig_tokens,
      COALESCE(SUM(comp_tokens),0) as comp_tokens,
      COALESCE(SUM(saved_tokens),0) as saved_tokens,
      COALESCE(AVG(saved_pct),0) as avg_pct
    FROM events
  `).get();

  const today = d.prepare(`
    SELECT
      COUNT(*) as calls,
      COALESCE(SUM(saved_tokens),0) as saved_tokens
    FROM events WHERE ts >= date('now')
  `).get();

  // Per-command breakdown
  const byCmd = d.prepare(`
    SELECT command,
      COUNT(*) as calls,
      SUM(orig_tokens) as orig_tokens,
      SUM(comp_tokens) as comp_tokens,
      SUM(saved_tokens) as saved_tokens,
      AVG(saved_pct) as avg_pct
    FROM events
    GROUP BY command
    ORDER BY saved_tokens DESC
    LIMIT 20
  `).all();

  // Daily savings for last 30 days
  const daily = d.prepare(`
    SELECT substr(ts,1,10) as day,
      COUNT(*) as calls,
      SUM(orig_tokens) as orig_tokens,
      SUM(comp_tokens) as comp_tokens,
      SUM(saved_tokens) as saved_tokens
    FROM events
    WHERE ts >= date('now','-30 days')
    GROUP BY day
    ORDER BY day ASC
  `).all();

  return { total, today, byCmd, daily };
}

module.exports = { insertEvent, getRecentEvents, getStats };
