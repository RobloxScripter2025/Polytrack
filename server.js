// server.js
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const DATA_DIR = path.join(__dirname, 'data');
const TRACKS_FILE = path.join(DATA_DIR, 'tracks.json');
const TIMES_FILE = path.join(DATA_DIR, 'times.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(TRACKS_FILE)) fs.writeFileSync(TRACKS_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(TIMES_FILE)) fs.writeFileSync(TIMES_FILE, JSON.stringify({}, null, 2));

app.use(cors());
app.use(bodyParser.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Helper read/write
function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// API: list tracks
app.get('/api/tracks', (req, res) => {
  const tracks = readJSON(TRACKS_FILE);
  res.json(tracks);
});

// API: get single track by id
app.get('/api/tracks/:id', (req, res) => {
  const id = req.params.id;
  const tracks = readJSON(TRACKS_FILE);
  const track = tracks.find(t => t.id === id);
  if (!track) return res.status(404).json({ error: 'Track not found' });
  res.json(track);
});

// API: create new track (from editor)
// Expected body: { id, name, points: [{x,y,z}, ...] }
app.post('/api/tracks', (req, res) => {
  const tracks = readJSON(TRACKS_FILE);
  const { id, name, points } = req.body;
  if (!id || !name || !points) return res.status(400).json({ error: 'Missing fields' });
  if (tracks.find(t => t.id === id)) return res.status(400).json({ error: 'ID already exists' });
  tracks.push({ id, name, points, created: Date.now() });
  writeJSON(TRACKS_FILE, tracks);
  res.json({ ok: true });
});

// API: submit time
// Expected body: { trackId, name, timeMs }
app.post('/api/submit-time', (req, res) => {
  const { trackId, name, timeMs } = req.body;
  if (!trackId || typeof timeMs !== 'number' || !name) return res.status(400).json({ error: 'Missing fields' });
  const times = readJSON(TIMES_FILE);
  if (!times[trackId]) times[trackId] = [];
  times[trackId].push({ name, timeMs, ts: Date.now() });
  // keep top 50 by ascending time
  times[trackId].sort((a,b) => a.timeMs - b.timeMs);
  times[trackId] = times[trackId].slice(0, 50);
  writeJSON(TIMES_FILE, times);
  res.json({ ok: true });
});

// API: leaderboard
app.get('/api/leaderboard', (req, res) => {
  const trackId = req.query.track;
  const times = readJSON(TIMES_FILE);
  if (!trackId) return res.json(times);
  res.json(times[trackId] || []);
});

// fallback - serve index
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`PolyTrack server listening on port ${port}`));
