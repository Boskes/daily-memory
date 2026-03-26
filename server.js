/**
 * Daily Memory System
 * ===================
 * Stores daily logs of conversations and work sessions.
 * Each day has its own JSON file: data/YYYY-MM-DD.json
 *
 * Port: 3004
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app      = express();
const PORT     = 3004;
const DATA_DIR = path.join(__dirname, 'data');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Helpers ───────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function dayFile(date) {
  return path.join(DATA_DIR, `${date}.json`);
}

function readDay(date) {
  try {
    return JSON.parse(fs.readFileSync(dayFile(date), 'utf8'));
  } catch {
    return { date, entries: [] };
  }
}

function writeDay(date, data) {
  fs.writeFileSync(dayFile(date), JSON.stringify(data, null, 2));
}

function getAllDates() {
  return fs.readdirSync(DATA_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map(f => f.replace('.json', ''))
    .sort()
    .reverse();
}

// ── Routes ────────────────────────────────────────────────────────

// GET /api/days — list all dates that have logs
app.get('/api/days', (_req, res) => {
  const dates = getAllDates();
  const summary = dates.map(date => {
    const day = readDay(date);
    return {
      date,
      count: day.entries.length,
      projects: [...new Set(day.entries.map(e => e.project).filter(Boolean))],
      preview: day.entries[0]?.title || '',
    };
  });
  res.json(summary);
});

// GET /api/days/:date — get full log for a specific day
app.get('/api/days/:date', (req, res) => {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
  }
  res.json(readDay(date));
});

// POST /api/days/:date/entries — add an entry to a day
app.post('/api/days/:date/entries', (req, res) => {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date format' });
  }

  const { title, summary, project, tags, details } = req.body;
  if (!title || !summary) {
    return res.status(400).json({ error: 'title and summary are required' });
  }

  const day = readDay(date);
  const entry = {
    id: `${date}-${String(day.entries.length + 1).padStart(3, '0')}`,
    timestamp: new Date().toISOString(),
    title,
    summary,
    project: project || null,
    tags: tags || [],
    details: details || [],
  };

  day.entries.unshift(entry); // newest first
  writeDay(date, day);
  res.status(201).json(entry);
});

// POST /api/log — shortcut: log to today
app.post('/api/log', (req, res) => {
  const date = req.body.date || todayStr();
  const { title, summary, project, tags, details } = req.body;
  if (!title || !summary) {
    return res.status(400).json({ error: 'title and summary are required' });
  }

  const day = readDay(date);
  const entry = {
    id: `${date}-${String(day.entries.length + 1).padStart(3, '0')}`,
    timestamp: new Date().toISOString(),
    title,
    summary,
    project: project || null,
    tags: tags || [],
    details: details || [],
  };

  day.entries.unshift(entry);
  writeDay(date, day);
  res.status(201).json(entry);
});

// DELETE /api/days/:date/entries/:id — delete a specific entry
app.delete('/api/days/:date/entries/:id', (req, res) => {
  const { date, id } = req.params;
  const day = readDay(date);
  const before = day.entries.length;
  day.entries = day.entries.filter(e => e.id !== id);
  if (day.entries.length === before) {
    return res.status(404).json({ error: 'Entry not found' });
  }
  writeDay(date, day);
  res.json({ ok: true });
});

// GET /api/search?q=...&project=...  — search across all days
app.get('/api/search', (req, res) => {
  const { q = '', project, from, to } = req.query;
  const ql = q.toLowerCase();
  const results = [];

  const dates = getAllDates().filter(d => {
    if (from && d < from) return false;
    if (to   && d > to)   return false;
    return true;
  });

  for (const date of dates) {
    const day = readDay(date);
    for (const entry of day.entries) {
      if (project && entry.project !== project) continue;
      if (ql && !(
        entry.title.toLowerCase().includes(ql) ||
        entry.summary.toLowerCase().includes(ql) ||
        (entry.details || []).some(d => d.toLowerCase().includes(ql)) ||
        (entry.tags || []).some(t => t.toLowerCase().includes(ql))
      )) continue;
      results.push({ date, ...entry });
    }
  }

  res.json({ query: q, count: results.length, results });
});

// GET /api/stats — overall stats
app.get('/api/stats', (_req, res) => {
  const dates = getAllDates();
  let totalEntries = 0;
  const projectCounts = {};
  const tagCounts = {};

  for (const date of dates) {
    const day = readDay(date);
    totalEntries += day.entries.length;
    for (const e of day.entries) {
      if (e.project) projectCounts[e.project] = (projectCounts[e.project] || 0) + 1;
      for (const t of (e.tags || [])) {
        tagCounts[t] = (tagCounts[t] || 0) + 1;
      }
    }
  }

  res.json({
    totalDays: dates.length,
    totalEntries,
    projectCounts,
    tagCounts,
    recentDates: dates.slice(0, 7),
  });
});

// ── Boot ──────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🧠 Daily Memory System draait op http://localhost:${PORT}`);
});
