// SlowPan same-origin transport — used when the overlay is served by the bundled
// Node server (src/server.js). It derives its WebSocket URL from the page's own
// origin, so there is nothing to configure: change the server's port and the
// overlay follows automatically (the panel is loaded FROM that port).
//
// It re-dispatches every server message as a window `svc:message` CustomEvent,
// which is the contract the overlay's render logic consumes. The server sends a
// `sync` (current config + image manifests) on connect and `kenburns:update` on
// any live change.

(function () {
  'use strict';

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const WS_URL = `${proto}//${location.host}`;
  const RECONNECT_BASE_MS = 2000;
  const RECONNECT_MAX_MS = 15000;

  let ws = null;
  let reconnectDelay = RECONNECT_BASE_MS;

  function setOffline(isOffline) {
    const root = document.querySelector('#stage, .panel');
    if (root) root.classList.toggle('offline', isOffline);
  }

  function connect() {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      reconnectDelay = RECONNECT_BASE_MS;
      setOffline(false);
    };

    ws.onmessage = (evt) => {
      let msg;
      try { msg = JSON.parse(evt.data); } catch { return; }
      window.dispatchEvent(new CustomEvent('svc:message', { detail: msg }));
    };

    ws.onclose = () => {
      setOffline(true);
      setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 1.5, RECONNECT_MAX_MS);
        connect();
      }, reconnectDelay);
    };

    ws.onerror = () => { /* onclose handles reconnect */ };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setOffline(true));
  } else {
    setOffline(true);
  }
  connect();
})();
