# Changelog

## v1.0.0 — 2026-08-18

First release.

### Features

- Conversation question index: lists every `user/message` (append-origin only) in the current session
- One-click jump: scrolls to the exact message with a 1.6s highlight flash
- Search filter: case-insensitive substring match, live hits/total counter
- View pagination: 10 / 30 / 50 per page with pager and global numbering
- Lazy load + paging: 200 messages per fetch, "Load older questions" on demand
- Per-session memory cache: 60s TTL tail refresh with seq-based incremental merge, LRU of 5 sessions
- Smooth interactions: fade animations, close on outside click / Esc, contained wheel events

### Fixes

- Correct event unwrapping (`{event}` wrapper), content-block arrays, `data.id` message ids
- `surfaceOp === 'append'` filter so every listed question is jumpable
- Manual scrollport targeting + bounded walk-up scroll for virtualized conversation views
- `Math.min(...largeArray)` stack overflow fixed with reduce
