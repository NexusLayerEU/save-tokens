'use strict';
// SaveTokens Web Server — port 4044
// Receives events from the savetokens CLI wrapper and serves the dashboard.

const express = require('express');
const path = require('path');
const db = require('./lib/db');
const sse = require('./lib/events');

const PORT = process.env.PORT || 4044;
const app = express();

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── SSE live stream ──────────────────────────────────────────────────────────

app.get('/events', (req, res) => {
  sse.addClient(res);
});

// ── REST API ─────────────────────────────────────────────────────────────────

// POST /api/event  — called by the savetokens CLI after each command
app.post('/api/event', (req, res) => {
  const ev = req.body;
  if (!ev || !ev.command) return res.status(400).json({ error: 'missing command' });

  try {
    db.insertEvent(ev);
    sse.broadcast('command', ev);
    res.json({ ok: true, clients: sse.clientCount() });
  } catch (err) {
    console.error('DB insert error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stats  — summary stats for the dashboard
app.get('/api/stats', (req, res) => {
  try {
    res.json(db.getStats());
  } catch (err) {
    console.error('Stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/requests?limit=N  — recent commands list
app.get('/api/requests', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 200, 1000);
  try {
    res.json(db.getRecentEvents(limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health
app.get('/health', (_req, res) => res.json({ ok: true, port: PORT, clients: sse.clientCount() }));

app.listen(PORT, () => {
  console.log(`SaveTokens dashboard → http://localhost:${PORT}`);
});
