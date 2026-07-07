# Running SlowPan inside Streamer.bot

If you already run [Streamer.bot](https://streamer.bot/), you don't need the bundled
Node server — SB hosts the overlay + images and a small C# action supplies the image
list. Verified against Streamer.bot **1.0.4**.

## 1. Enable the two servers

In Streamer.bot → **Servers/Clients**:

- **WebSocket Server** — enable, `127.0.0.1:8080`, authentication **off** (for local use).
- **HTTP Server** — enable, `127.0.0.1:7474`, and add two Path → Folder mappings:

  | Path | Folder |
  |---|---|
  | `media` | `…\SlowPan\collections` |
  | `overlay` | `…\SlowPan\overlay` |

  `media` must match `MEDIA_BASE` in the action; `overlay` serves the HTML and
  `panel-client-sb.js` (they live in the same folder, so the relative include resolves).

## 2. Import the action

Actions → new action named **exactly** `Kenburns Push` (the name matters — the overlay
does `DoAction { name: "Kenburns Push" }` on connect to pull current state). Add a
sub-action **Core → C# → Execute C# Code**, paste [`../streamerbot/kenburns-push.cs`](../streamerbot/kenburns-push.cs),
edit `ROOT` and `MEDIA_BASE` at the top, and **Compile** — it must report success.

Optional persisted global variables override the defaults:
`kenburns.collection`, `kenburns.durationMs`, `kenburns.transitionMs`,
`kenburns.zoomMin`, `kenburns.zoomMax`, `kenburns.order`.

## 3. Add the Browser Source

```
http://127.0.0.1:7474/overlay/kenburns-slideshow.html?transport=sb
```

## Switching collections live

Make a second action whose C# sets the variable then re-runs the push:

```csharp
public class CPHInline {
  public bool Execute() {
    string coll;
    if (CPH.TryGetArg("value", out coll) && !string.IsNullOrWhiteSpace(coll))
      CPH.SetGlobalVar("kenburns.collection", coll.Trim(), true);
    CPH.RunAction("Kenburns Push");
    return true;
  }
}
```

## Troubleshooting

Load the overlay in a browser with `?transport=sb&sbdebug=1` and watch the console.

| Last log line | Cause | Fix |
|---|---|---|
| `WebSocket error …` | WS Server off / wrong port / **auth on** | Enable it at `:8080`, auth off |
| `requesting state via DoAction` then nothing | The `Kenburns Push` C# didn't broadcast: name mismatch or a **compile error** | Confirm the action name and that the C# compiled |
| `General.Custom → kenburns:update` but still black | Images 404 | Check the `media` Path→Folder map matches `MEDIA_BASE` |

Two Streamer.bot compile gotchas the action already works around: SB's C# host
references **neither `Newtonsoft.Json` nor `System.Uri`** — using either fails to compile
(and the action then runs but broadcasts nothing). This action hand-writes its JSON and
percent-encodes with a built-in helper, so it needs no added references.
