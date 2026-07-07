// SlowPan smoke test — starts the server on a test port, then verifies the HTTP
// surface, the WebSocket sync payload, and (if playwright-core is installed) that a
// real browser paints a loaded slideshow image. No Streamer.bot / OBS required.
//
//   npm run smoke
//
// Only `ws` is required (a runtime dependency). The render step is optional and
// silently skips when playwright-core isn't present.

import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PORT = Number(process.env.SLOWPAN_PORT) || 7099;
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${!ok && d ? ' — ' + d : ''}`); };

function startServer() {
  return new Promise((res, rej) => {
    const child = spawn(process.execPath, ['src/server.js'], {
      cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, SLOWPAN_PORT: String(PORT) },
    });
    let out = '';
    const t = setTimeout(() => rej(new Error('server did not start in 8s\n' + out)), 8000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d) => { out += d; if (out.includes('SlowPan ready')) { clearTimeout(t); res(child); } });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (d) => { out += d; });
    child.on('exit', (c) => { if (c) rej(new Error('server exited ' + c + '\n' + out)); });
  });
}

async function main() {
  console.log('SlowPan smoke test\n');
  let srv, renderOk = true;
  try {
    srv = await startServer();
    console.log(`server up on :${PORT}\n`);

    console.log('[1] HTTP surface');
    const html = await fetch(`${BASE}/kenburns-slideshow.html`);
    const body = await html.text();
    check('overlay HTML 200 + text/html', html.status === 200 && (html.headers.get('content-type') || '').includes('text/html'));
    check('overlay wired to svc:message', body.includes('svc:message'));
    const core = await fetch(`${BASE}/panel-core.js`);
    check('panel-core.js 200 + javascript', core.status === 200 && (core.headers.get('content-type') || '').includes('javascript'));
    const img = await fetch(`${BASE}/media/sample/01-slate.jpg`); await img.arrayBuffer();
    check('sample image 200 + image/*', img.status === 200 && (img.headers.get('content-type') || '').startsWith('image/'));
    const root = await fetch(`${BASE}/`, { redirect: 'manual' });
    check('/ redirects to the overlay', root.status === 302);

    console.log('\n[2] WebSocket sync');
    const payload = await new Promise((res, rej) => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
      const t = setTimeout(() => rej(new Error('no sync within 5s')), 5000);
      ws.on('message', (m) => { clearTimeout(t); ws.close(); try { res(JSON.parse(m.toString())); } catch (e) { rej(e); } });
      ws.on('error', rej);
    });
    check('sync message on connect', payload.type === 'sync');
    check('has config + manifests', !!(payload.kenburns && payload.kenburns.config && payload.kenburns.manifests));
    const imgs = (payload.kenburns && payload.kenburns.manifests && payload.kenburns.manifests.sample) || [];
    check('sample manifest non-empty', imgs.length > 0, 'len=' + imgs.length);
    check('same-origin /media/ URLs', (imgs[0] || '').startsWith('/media/sample/'), imgs[0]);
    check('config.collection === "sample"', payload.kenburns && payload.kenburns.config && payload.kenburns.config.collection === 'sample');

    console.log('\n[3] render (optional — needs playwright-core)');
    try {
      const { chromium } = await import('playwright-core');
      let browser;
      for (const channel of ['msedge', 'chrome']) { try { browser = await chromium.launch({ channel, headless: true }); break; } catch {} }
      if (!browser) browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      await page.goto(`${BASE}/kenburns-slideshow.html`, { waitUntil: 'load' });
      renderOk = await page.waitForFunction(() => {
        const v = document.querySelector('.kb-layer.visible');
        if (!v) return false;
        const i = v.querySelector('img');
        return i && i.naturalWidth > 0 && parseFloat(getComputedStyle(v).opacity) > 0.95;
      }, { timeout: 12000 }).then(() => true).catch(() => false);
      const shot = resolve(ROOT, 'render-check.png');
      await page.screenshot({ path: shot });
      await browser.close();
      check('slideshow painted a loaded image', renderOk);
      console.log('  screenshot →', shot);
    } catch (e) {
      console.log('  skipped:', e.message.split('\n')[0]);
    }
  } catch (err) {
    fail++;
    console.log('\n  ERROR ' + err.message);
  } finally {
    if (srv) srv.kill();
  }

  console.log(`\n${fail === 0 ? 'ALL GREEN' : 'FAILURES'}: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
