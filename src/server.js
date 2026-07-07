// SlowPan standalone server — one process, one port.
//
// Serves the overlay + its transport client + the image collections over HTTP,
// and runs a WebSocket endpoint on the SAME port that replays current state
// (config + image manifests) to every overlay on connect and rebroadcasts on any
// change. This is the self-contained equivalent of the StreamService relay +
// ControlPanel static server, collapsed into one shareable tool.
//
//   npm start        # then add the printed URL as an OBS Browser Source
//
// No StreamService, no ControlPanel. The only dependency is `ws` (MIT).

import { createServer } from 'node:http';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { watch, readFileSync } from 'node:fs';
import { resolve, dirname, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OVERLAY_DIR = resolve(ROOT, 'overlay');
const CONFIG_PATH = resolve(ROOT, 'config.json');
const CONFIG_EXAMPLE = resolve(ROOT, 'config.example.json');

const IMAGE_RE = /\.(jpe?g|png|webp|gif|avif)$/i;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif',
};

const DEFAULTS = {
  port: 7090,
  host: '127.0.0.1',
  mediaDir: './collections',
  collection: 'sample',
  durationMs: 8000,
  transitionMs: 1500,
  zoomMin: 1.0,
  zoomMax: 1.25,
  order: 'random',
};

// ── Config ───────────────────────────────────────────────────────────────────
function clamp(v, lo, hi, dflt) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
}

function sanitize(raw) {
  const c = { ...DEFAULTS };
  if (raw && typeof raw === 'object') {
    if (Number.isInteger(raw.port)) c.port = raw.port;
    if (typeof raw.host === 'string' && raw.host.trim()) c.host = raw.host.trim();
    if (typeof raw.mediaDir === 'string' && raw.mediaDir.trim()) c.mediaDir = raw.mediaDir.trim();
    if (typeof raw.collection === 'string' && raw.collection.trim()) c.collection = raw.collection.trim();
    c.durationMs = clamp(raw.durationMs, 2000, 30000, DEFAULTS.durationMs);
    c.transitionMs = clamp(raw.transitionMs, 200, 5000, DEFAULTS.transitionMs);
    c.zoomMin = clamp(raw.zoomMin, 1.0, 2.0, DEFAULTS.zoomMin);
    c.zoomMax = clamp(raw.zoomMax, c.zoomMin, 2.5, DEFAULTS.zoomMax);
    c.order = String(raw.order ?? '').trim().toLowerCase() === 'sequential' ? 'sequential' : 'random';
  }
  return c;
}

function loadConfigSync() {
  for (const p of [CONFIG_PATH, CONFIG_EXAMPLE]) {
    try { return sanitize(JSON.parse(readFileSync(p, 'utf-8'))); } catch { /* try next */ }
  }
  return { ...DEFAULTS };
}

let config = loadConfigSync();
// The overlay's config subset (what the render logic reads).
function overlayConfig() {
  const { collection, durationMs, transitionMs, zoomMin, zoomMax, order } = config;
  return { collection, durationMs, transitionMs, zoomMin, zoomMax, order };
}

// ── Collection scan ──────────────────────────────────────────────────────────
function mediaRoot() { return resolve(ROOT, config.mediaDir); }

async function scanCollections() {
  const collections = [];
  const manifests = {};
  try {
    const dirents = await readdir(mediaRoot(), { withFileTypes: true });
    for (const d of dirents) {
      if (!d.isDirectory()) continue;
      let files = [];
      try {
        files = (await readdir(resolve(mediaRoot(), d.name))).filter((f) => IMAGE_RE.test(f)).sort();
      } catch { /* unreadable — treat as empty */ }
      collections.push(d.name);
      // Same-origin, host-independent URLs — no hardcoded localhost.
      manifests[d.name] = files.map(
        (f) => `/media/${encodeURIComponent(d.name)}/${encodeURIComponent(f)}`,
      );
    }
  } catch (err) {
    if (err.code !== 'ENOENT') log(`scan error: ${err.message}`);
  }
  collections.sort();
  return { collections, manifests };
}

async function buildPayload(type) {
  const scan = await scanCollections();
  return { type, kenburns: { config: overlayConfig(), ...scan } };
}

// ── HTTP ─────────────────────────────────────────────────────────────────────
function withinBase(base, target) {
  const b = normalize(base + sep);
  return target === normalize(base) || normalize(target).startsWith(b);
}

async function serveFile(res, file, base) {
  const abs = resolve(base, '.' + file); // file starts with '/'
  if (!withinBase(base, abs)) { res.writeHead(403).end('forbidden'); return; }
  try {
    const body = await readFile(abs);
    res.writeHead(200, { 'content-type': MIME[extname(abs).toLowerCase()] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  }
}

const httpServer = createServer(async (req, res) => {
  const path = decodeURIComponent((req.url || '/').split('?')[0]);
  if (path === '/' ) { res.writeHead(302, { location: '/kenburns-slideshow.html' }).end(); return; }
  if (path === '/health') { res.writeHead(200).end('ok'); return; }
  if (path.startsWith('/media/')) { await serveFile(res, path.slice('/media'.length), mediaRoot()); return; }
  await serveFile(res, path, OVERLAY_DIR); // overlay HTML + transport clients
});

// ── WebSocket ─────────────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', async (ws) => {
  try { ws.send(JSON.stringify(await buildPayload('sync'))); } catch { /* client gone */ }
  ws.on('message', async (raw) => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }
    if (m.type === 'setConfig' && m.config && typeof m.config === 'object') {
      config = sanitize({ ...config, ...m.config });
      try { await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2)); } catch {}
      await broadcastUpdate();
    } else if (m.type === 'rescan') {
      await broadcastUpdate();
    }
  });
});

async function broadcastUpdate() {
  const msg = JSON.stringify(await buildPayload('kenburns:update'));
  for (const ws of wss.clients) { if (ws.readyState === 1) { try { ws.send(msg); } catch {} } }
}

// Live reload: reload config.json + rescan media on change (debounced, best-effort).
let reloadTimer = null;
function scheduleReload(why) {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(async () => {
    config = loadConfigSync();
    await broadcastUpdate();
    log(`reloaded (${why})`);
  }, 250);
}
try { watch(ROOT, (_e, f) => { if (f === 'config.json') scheduleReload('config.json'); }); } catch {}
try { watch(mediaRoot(), { recursive: true }, () => scheduleReload('media')); } catch { /* recursive watch may be unsupported */ }

// ── Start ──────────────────────────────────────────────────────────────────────
function log(msg) { console.log(`[${new Date().toISOString()}] [slowpan] ${msg}`); }

// Env overrides let you run a second instance (or a test) without editing config.json.
const PORT = Number(process.env.SLOWPAN_PORT) || config.port;
const HOST = process.env.SLOWPAN_HOST || config.host;

httpServer.listen(PORT, HOST, () => {
  const base = `http://${HOST}:${PORT}`;
  log(`SlowPan ready`);
  log(`OBS Browser Source URL:  ${base}/kenburns-slideshow.html`);
  log(`media dir: ${mediaRoot()}  (default collection: "${config.collection}")`);
});

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') log(`port ${config.port} is in use — change "port" in config.json`);
  else log(`server error: ${err.message}`);
  process.exit(1);
});
