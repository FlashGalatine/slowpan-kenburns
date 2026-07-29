# Changelog

All notable changes to **SlowPan** are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project aims to
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Nothing has been tagged since the initial release, so every change that landed
afterwards sits under **Unreleased**. Commit hashes and landing dates are noted
for traceability.

## [Unreleased]

### Added

- **Web control panel** (`overlay/control.html`, served at `/control` and
  `/control.html`): pick a collection, tune hold / crossfade / zoom / order,
  watch a live output preview, and copy the OBS Browser Source URLs. It drives
  the server's `setConfig` / `rescan` over WebSocket; changes persist to
  `config.json` and push live. The smoke test covers it (connect + collection
  list). (`52d19ff`, 2026-07-07)
- **On-screen empty-state hint.** When no images can play, the overlay explains
  why — a missing, typo'd or empty `?collection=`, or no default — and lists the
  available collection names, instead of showing a silent black screen.
  (`c2d8ffa`, 2026-07-10)

### Changed

- **SB HTTP prefixes namespaced to `slowpan-media` / `slowpan-overlay`.**
  Sibling Streamer.bot components share one `:7474` prefix namespace and the
  generic `media` / `overlay` names collide when components stack. Existing
  installs keep working on the old names; migrating means renaming both maps,
  updating the `MEDIA_BASE` constant (and re-compiling), and updating the OBS
  source URL together. (`7193984`, 2026-07-10)
- **Transport auto-detection.** With no `?transport=`, a root-level `http(s)`
  path is treated as the bundled Node server (`panel-core.js`) and any other
  origin or path — SB's `/slowpan-overlay/` mapping, `file://` — as
  Streamer.bot (`panel-client-sb.js`). This fixes the black screen when the
  SB-served URL omitted `?transport=sb` and the overlay tried `ws://` against
  SB's HTTP port. Explicit `?transport=node|sb` still forces one.
  (`c2d8ffa`, 2026-07-10)
- npm package renamed to `slowpan-kenburns`. (`92d8d2d`, 2026-07-07)

### Documentation

- README: clone / Download-ZIP as the first setup step. (`e1f3328`, 2026-07-21)
- Support links point at the personal Discord server. (`ad49ad1`, 2026-07-20)
- README states the overlay is a plain local web page — nothing OBS-specific —
  broadening the tagline to OBS / Streamlabs / XSplit with a compatibility
  bullet (Chromium ≥ 80 floor, old-XSplit caveat). (`5196d73`, 2026-07-09)
- Streamer.bot setup screenshots (WebSocket Server, HTTP Server mappings,
  action creation, "Compiled successfully!") embedded into `STREAMERBOT.md`;
  control-panel screenshot and an animated Ken Burns demo GIF added to the
  README. (`fb26c19` / `da658f4` / `912ba48`, 2026-07-07)
- Attribution set to Ashe "Flash" Galatine across LICENSE, package author and
  the README credit. (`9934797`, 2026-07-07)

## [0.1.0] — 2026-07-07

Initial release — a theme-agnostic slow pan/zoom slideshow background for OBS
browser sources. (`2b779c5`)

### Added

- Point it at a folder of images and it produces a randomized Ken Burns
  zoom-and-pan slideshow with crossfades.
- **Dual mode**: runs standalone on a bundled single-port Node server, or
  inside Streamer.bot (C# action + WebSocket).
- Ships CC0 procedurally-generated sample backdrops so it works on first run.
- MIT licensed.

[Unreleased]: https://github.com/FlashGalatine/slowpan-kenburns/compare/2b779c5...main
