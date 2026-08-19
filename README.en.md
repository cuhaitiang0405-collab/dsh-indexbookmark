# dsh-indexbookmark

A [DSH (DeepSeek Harness)](https://github.com/deepseek-ai/deepseek-harness) web client plugin: **conversation question index**. Adds a ☰ button beside the input box; click it to see every question you asked in the current session, and click any entry to scroll the conversation straight to that message with a highlight.

> Solves a long-conversation pain point: after dozens of turns it's hard to remember what you asked and where that discussion lives. dsh-indexbookmark turns this into one click.

## Features

- 📋 **Question index**: lists all `user/message` entries in the current session, chronologically ordered with global numbering
- 🎯 **Click to jump**: scrolls to the message + 1.6s highlight flash
- 🔍 **Search filter**: case-insensitive substring match, live `hits/total` counter in the header
- 📄 **View pagination**: 10 / 30 / 50 per page, `‹ 1/3 ›` pager, global numbering
- ⏳ **Lazy load + paging**: fetches only when opened, 200 messages per fetch, "Load older questions" on demand
- ⚡ **Per-session memory cache**: reopening the same session within 60s is instant (zero requests), LRU capped at 5 sessions
- 🪄 **Smooth interaction**: fade in/out animations; close on outside click or `Esc`; wheel events are contained inside the panel
- 🌗 **Theme aware**: uses DSH theme variables (`--dsw-alias-*`), adapts to light/dark
- 🌐 **Bilingual**: zh / en dictionaries follow the UI language

## Install

### From GitHub (recommended)

```powershell
# Prerequisite: global dsh + pnpm (`dsh plugin` forwards to pnpm)
dsh plugin --profile web add github:<your-username>/dsh-indexbookmark
```

`dsh plugin` will:
1. Fetch the repo via pnpm (the built `lib/client.js` ships with the repo — **no build needed**);
2. Detect the `dsh.bundle` declaration and **automatically** add the package to `dsh.profile.bundles`;
3. No manual edits to `cordis.patch.yml`.

Restart the web app afterwards:

```powershell
# stop the running dsh web, then
dsh web
```

### Local development install (symlink, hot edits)

```powershell
cd dsh-indexbookmark        # parent directory of the plugin source
dsh plugin --profile web add ./dsh-indexbookmark
```

With a symlink install: edit `src/client.tsx` → `node build.mjs` → hard refresh (Ctrl+Shift+R). No reinstall needed.

### Uninstall

```powershell
dsh plugin --profile web remove dsh-indexbookmark
```

## Usage

1. Open any session with history;
2. Click the **☰** button next to the input box;
3. The panel pops up: filter questions with the search box, click an entry to jump to that message;
4. Bottom of the panel: switch page size (10/30/50), or "Load older questions" for long sessions;
5. Click outside the panel or press `Esc` to close.

## Layout

```
dsh-indexbookmark/
├── package.json      # plugin manifest: dsh.bundle + dsh.client declarations
├── cordis.patch.yml  # bundle patch layer (inserts the plugin row)
├── build.mjs         # esbuild build script (JSX → loader-format bundle)
├── lib/
│   ├── index.js      # host half (minimal, lets the Loader mount)
│   └── client.js     # browser bundle (built artifact, shipped with the repo)
└── src/
    └── client.tsx    # browser source (the only file you hand-write)
```

## Development

```powershell
# Environment: Node.js 24+, pnpm (used by dsh plugin)

cd dsh-indexbookmark
# First time: install the build tool
npm install --save-dev esbuild
npm approve-scripts esbuild          # npm ≥10 may block its postinstall

# Build (produces lib/client.js)
node build.mjs        # or: npm run build
```

Dev loop: edit `src/client.tsx` → `node build.mjs` → hard refresh the browser.

## Architecture notes

- **Dual-face plugin**: host half is minimal (just enough for the Cordis Loader); the browser half does all the work;
- **Loader format**: `window.__ModuleLoader__.load({id, factory})`, module exports `{name, inject, apply}`;
- **Mount slot**: `conversation.input.right` (input-box utility seat — avoids crowding sidebar plugins);
- **Data source**: `api.sessions.history({sessionId, beforeSeq?, maxMessages?})`, filtered for `user/message` events with `surfaceOp === 'append'`;
- **Cache**: module-level `Map` storing only extracted questions; tail-page TTL 60s with seq-based incremental merge; LRU of 5 sessions.

## Known limitations

- Jump targeting uses text-prefix matching (first 40 chars); two identical prefixes may land on the earlier entry; if the target row is not rendered (very long sessions), the plugin auto-scrolls in steps to load it, and shows a notice if it still can't be found;
- The index only includes **append-origin** (`surfaceOp: append`) questions — consistent with what actually renders in the conversation, so every entry is jumpable;
- Search only covers loaded pages;
- Cache is browser-memory only — cleared on page refresh (F5).

## Roadmap (not implemented)

- Workspace-level md cache (persistent across F5) with MD5 verification
- Node-key precise anchoring (replaces text matching)
- Question grouping / turn bucketing
- Live session-event incremental subscription

## License

[MIT](LICENSE)
