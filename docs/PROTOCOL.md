# SlowPan protocol

The overlay is a pure renderer. It never opens a socket itself — a **transport
client** does that and re-dispatches each message as a `window` CustomEvent named
`svc:message`, with the parsed message as `event.detail`. The overlay listens for two
message types and ignores the rest.

> The wire schema is the contract. Breaking changes to it are a major version bump.

## Messages the overlay consumes

Both carry the same `kenburns` payload; `sync` is sent once on connect (state replay),
`kenburns:update` on every subsequent change.

```jsonc
{
  "type": "sync",            // or "kenburns:update"
  "kenburns": {
    "config": {
      "collection":  "sample",   // default collection name
      "durationMs":  8000,       // ms each image is shown (excl. crossfade)
      "transitionMs": 1500,      // ms crossfade
      "zoomMin":     1.0,
      "zoomMax":     1.25,
      "order":       "random"    // "random" | "sequential"
    },
    "collections": ["sample", "my-photos"],   // folder names (informational)
    "manifests": {
      "sample": [
        "/media/sample/01-slate.jpg",
        "/media/sample/02-violet.jpg"
      ],
      "my-photos": [ "/media/my-photos/a.jpg" ]
    }
  }
}
```

- **`manifests[name]`** is the ordered list of image URLs for that collection.
  - Bundled server: same-origin relative paths (`/media/<coll>/<file>`) — host-independent.
  - Streamer.bot: absolute URLs to SB's HTTP server (`http://127.0.0.1:7474/media/<coll>/<file>`).
- The overlay picks its collection from `?collection=<name>` (per source) if that
  collection exists in `manifests`, else `config.collection`.
- `collections` is not required by the renderer; it's there for a future control UI.

## Transports

Any transport that dispatches the above as `svc:message` works. Two ship:

| Transport | File | Feed |
|---|---|---|
| Bundled server | `overlay/panel-core.js` | connects to `ws(s)://<same-origin>`; server sends `sync` on connect, `kenburns:update` on change |
| Streamer.bot | `overlay/panel-client-sb.js` | subscribes to `General.Custom`; a C# action broadcasts the payload via `CPH.WebsocketBroadcastJson` |

## Control messages (bundled server only)

The bundled server also accepts, from any WebSocket client:

```jsonc
{ "type": "setConfig", "config": { "durationMs": 6000 } }  // merge + persist + rebroadcast
{ "type": "rescan" }                                       // re-scan folders + rebroadcast
```

A `kenburns:error` message (`{ "type": "kenburns:error", "message": "..." }`) may be
broadcast by the Streamer.bot action if its C# throws; the overlay ignores it, but it's
useful when debugging.

## Diagnostics

Load the overlay with `?sbdebug=1` (Streamer.bot transport) to log the connection and
message flow to the browser console.
