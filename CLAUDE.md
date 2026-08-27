# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla-JS Tetris (HTML5 Canvas). Three files, no dependencies, no `package.json`, no build step, no bundler, no transpiler, no test suite, no linter. See `README.md` (Spanish) for gameplay details and a customization table.

## Running

```bash
start index.html          # Windows — opens directly, works over file://
python3 -m http.server 8000   # or any static server, then http://localhost:8000
```

There are no automated tests. Verification is manual: open the page, play, and check the browser console. Any change should be exercised in a browser before being called done.

## Architecture

`game.js` is a single classic (non-module) script holding all game state in module-scope `let` bindings (`board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, combo, hsSaved, lastSavedEntry, records`). There are no classes and no exports; functions mutate those globals directly. Keep that style — introducing modules would break `file://` loading.

Load order matters: `game.js` is the last element in `<body>`, has no `defer`, queries all DOM nodes at parse time, and calls `init()` at top level. Moving the `<script>` tag or adding `type="module"` breaks it.

Key structures and invariants:

- **Board** — `ROWS × COLS` array of ints. `0` = empty; `1–8` = piece type, which is *also* the index into `COLORS`. Piece matrices in `PIECES` are filled with their own type number for this reason, so a cell can be drawn without knowing which piece it came from.
- **Rotation** — `rotateCW` transposes + reverses into a fresh matrix. `tryRotate` applies basic wall kicks by trying x-offsets `[0, -1, 1, -2, 2]` and taking the first that doesn't `collide`; if none fit, the rotation is silently dropped.
- **Collision** — `collide(shape, ox, oy)` is the single source of truth for legality; it is reused by movement, rotation, soft/hard drop, ghost projection, and the game-over check in `spawn()`. It deliberately allows `ny < 0` so a piece may straddle the top edge.
- **Game loop** — `loop(ts)` via `requestAnimationFrame`, accumulating `dt` into `dropAccum` and advancing one row when `dropAccum >= dropInterval`. Pause/game-over work by `cancelAnimationFrame(animId)`; resuming *must* reset `lastTime = performance.now()` first or the accumulated `dt` spans the whole pause.
- **Rendering** — `draw()` clears and repaints everything each frame (grid → locked board → ghost at `ghostY()` with alpha 0.2 → current piece). There is no dirty-rect or partial redraw; adding visuals means adding a pass here.
- **Tuerca (type 8)** — a 3×3 ring with a hollow centre. Its round hole is not board state, it is drawn: `drawNutHole` erases a circle with `globalCompositeOperation = 'destination-out'` (theme-proof — it reveals the CSS `--board-bg`) *after* the blocks are painted. Locked nuts are found by pattern (`isNutHole`: an empty cell whose 8 neighbours are all `8`), so a nut split by a line clear simply reverts to a square hole. For the current piece and ghost, `carveCurrentNutHole` first checks the centre board cell is empty — a nut can legally straddle an overhanging block, and erasing there would hide a real block.
- **HUD** — the canvas and the DOM HUD are separate. Score/lines/level changes only reach the screen through `updateHUD()`, which the keydown handler calls unconditionally after every input; new code paths that change those values must call it themselves.
- **Difficulty** — `clearLines()` owns scoring *and* progression: `level = floor(lines/10)+1`, `dropInterval = max(100, 1000 - (level-1)*90)`. It also returns `cleared` (the number of rows removed by that call), which is the only signal `lockPiece()` has for combo tracking.
- **Restart** — `init()` is the reset function and is called both at startup and by the restart button; anything added to game state must be re-initialized there.
- **Records** (`tetris.records` in `localStorage`) — shape `{ top: [{name, score, lines, level, date}], bestCombo, maxLines }`. `loadRecords()` parses defensively (`try/catch` + `Array.isArray(parsed.top)` + per-field type checks on each entry) so a corrupted or hand-edited value can't break startup or make `renderRecords` print `"undefined"` cells; unrecoverable input falls back to an empty store. `saveRecords()` also wraps `localStorage.setItem` in `try/catch` — it's called from inside `lockPiece()` (via the game loop), so a storage failure (private mode, quota, sandboxed iframe) must not throw and kill the `requestAnimationFrame` chain. `combo` counts consecutive locks that clear ≥1 line, tracked in `lockPiece()` from `clearLines()`'s return value and reset to `0` on a non-clearing lock; `records.bestCombo`/`records.maxLines` are historical bests updated (and persisted) the moment they're beaten, not just at game over. `hsSaved`/`lastSavedEntry` are per-run flags reset in `init()`: `hsSaved` stops the save button from inserting a duplicate row on a double click or after a restart, `lastSavedEntry` is the object-identity reference `renderRecords` uses to add the highlight class to the just-saved row. `renderRecords(containerEl)` is a standalone, reusable render function (builds a table + summary via `innerHTML` into whatever element it's given) — the game-over overlay calls it with `#hs-records`, and it's designed so another screen (e.g. a pause menu) can call it with a different container without new plumbing.

## Gotchas

- Canvas sizes are hardcoded in `index.html` and must match the JS constants: `#board` is `COLS*BLOCK × ROWS*BLOCK` (300×600) and `#next-canvas` assumes a 4×4 grid at 30px (120×120, `NB` in `drawNext`). Changing `COLS`, `ROWS`, or `BLOCK` requires editing the HTML too.
- User-facing strings (overlay text, control list) are Spanish; keep new UI text consistent.
- The tuerca's hole is sealed by its own blocks, so nothing can ever fall into it: the middle row of every locked nut is permanently unclearable. That is deliberate (it is the challenge piece), not a bug — don't "fix" it in `clearLines`.
- `hardDrop` and `softDrop` end in `lockPiece()` → `merge` → `clearLines` → `spawn`; there is no lock delay, so a piece cannot be slid after landing.
- The records UI (`#hs-save-row`, `#hs-name`, `#hs-save-btn`, `#hs-records`, `#hs-reset`) lives inside `#overlay-box`, appended after `#restart-btn`, and is shared with the same overlay used for `PAUSA` — `togglePause()` doesn't touch or hide it, so it stays in whatever state the last `endGame()`/save/reset left it in while the game is paused. Don't reorder the existing `#overlay-title`/`#overlay-score`/`#restart-btn` markup.
