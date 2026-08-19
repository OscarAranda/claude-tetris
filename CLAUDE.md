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

`game.js` is a single classic (non-module) script holding all game state in module-scope `let` bindings (`board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId`). There are no classes and no exports; functions mutate those globals directly. Keep that style — introducing modules would break `file://` loading.

Load order matters: `game.js` is the last element in `<body>`, has no `defer`, queries all DOM nodes at parse time, and calls `init()` at top level. Moving the `<script>` tag or adding `type="module"` breaks it.

Key structures and invariants:

- **Board** — `ROWS × COLS` array of ints. `0` = empty; `1–7` = piece type, which is *also* the index into `COLORS`. Piece matrices in `PIECES` are filled with their own type number for this reason, so a cell can be drawn without knowing which piece it came from.
- **Rotation** — `rotateCW` transposes + reverses into a fresh matrix. `tryRotate` applies basic wall kicks by trying x-offsets `[0, -1, 1, -2, 2]` and taking the first that doesn't `collide`; if none fit, the rotation is silently dropped.
- **Collision** — `collide(shape, ox, oy)` is the single source of truth for legality; it is reused by movement, rotation, soft/hard drop, ghost projection, and the game-over check in `spawn()`. It deliberately allows `ny < 0` so a piece may straddle the top edge.
- **Game loop** — `loop(ts)` via `requestAnimationFrame`, accumulating `dt` into `dropAccum` and advancing one row when `dropAccum >= dropInterval`. Pause/game-over work by `cancelAnimationFrame(animId)`; resuming *must* reset `lastTime = performance.now()` first or the accumulated `dt` spans the whole pause.
- **Rendering** — `draw()` clears and repaints everything each frame (grid → locked board → ghost at `ghostY()` with alpha 0.2 → current piece). There is no dirty-rect or partial redraw; adding visuals means adding a pass here.
- **HUD** — the canvas and the DOM HUD are separate. Score/lines/level changes only reach the screen through `updateHUD()`, which the keydown handler calls unconditionally after every input; new code paths that change those values must call it themselves.
- **Difficulty** — `clearLines()` owns scoring *and* progression: `level = floor(lines/10)+1`, `dropInterval = max(100, 1000 - (level-1)*90)`.
- **Restart** — `init()` is the reset function and is called both at startup and by the restart button; anything added to game state must be re-initialized there.

## Gotchas

- Canvas sizes are hardcoded in `index.html` and must match the JS constants: `#board` is `COLS*BLOCK × ROWS*BLOCK` (300×600) and `#next-canvas` assumes a 4×4 grid at 30px (120×120, `NB` in `drawNext`). Changing `COLS`, `ROWS`, or `BLOCK` requires editing the HTML too.
- User-facing strings (overlay text, control list) are Spanish; keep new UI text consistent.
- `hardDrop` and `softDrop` end in `lockPiece()` → `merge` → `clearLines` → `spawn`; there is no lock delay, so a piece cannot be slid after landing.
