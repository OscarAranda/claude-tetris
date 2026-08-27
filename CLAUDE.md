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

- **Board** — `ROWS × COLS` array of ints. `0` = empty; `1–8` = piece type, which is *also* the index into `COLORS`. Piece matrices in `PIECES` are filled with their own type number for this reason, so a cell can be drawn without knowing which piece it came from.
- **Rotation** — `rotateCW` transposes + reverses into a fresh matrix. `tryRotate` applies basic wall kicks by trying x-offsets `[0, -1, 1, -2, 2]` and taking the first that doesn't `collide`; if none fit, the rotation is silently dropped.
- **Collision** — `collide(shape, ox, oy)` is the single source of truth for legality; it is reused by movement, rotation, soft/hard drop, ghost projection, and the game-over check in `spawn()`. It deliberately allows `ny < 0` so a piece may straddle the top edge.
- **Game loop** — `loop(ts)` via `requestAnimationFrame`, accumulating `dt` into `dropAccum` and advancing one row when `dropAccum >= dropInterval`. Pause/game-over work by `cancelAnimationFrame(animId)`; resuming *must* reset `lastTime = performance.now()` first or the accumulated `dt` spans the whole pause.
- **Rendering** — `draw()` clears and repaints everything each frame (grid → locked board → ghost at `ghostY()` with alpha 0.2 → current piece). There is no dirty-rect or partial redraw; adding visuals means adding a pass here.
- **Skins** — `SKINS` is `{ id: { label, render, grid, colors[9] } }` for `retro`/`claro`/`neon`/`pastel`/`pixel`. `COLORS` is a `let`, not a `const`: it's reassigned to `SKINS[currentSkin].colors` by `applySkin()`, so it always points at the active skin's palette but keeps the same 9-slot shape (`null` at 0, types 1–8). `drawBlock` is a thin dispatcher that looks up `SKINS[currentSkin].render` (`'flat' | 'neon' | 'pastel' | 'pixel'`) in `SKIN_RENDERERS` and delegates to the matching `drawBlock*` function (falls back to `drawBlockFlat` if the name is ever wrong, so a bad skin entry can't throw inside the `requestAnimationFrame` loop). `drawGrid` reads `SKINS[currentSkin].grid` instead of a hardcoded color. Switching skins sets `document.body.dataset.skin` (drives the CSS custom properties, including `--board-bg`), reassigns `COLORS`, persists `tetris.skin` to `localStorage`, and calls `draw()` + `drawNext()` immediately — no reload. The skin is a persisted preference, not game state: `init()` never touches it. `drawBlockNeon` sets `ctx.shadowBlur`/`shadowColor` for the glow and explicitly resets `shadowBlur = 0` before returning (don't rely on `save()`/`restore()` alone for this — it must be a plain reset, since `restore()` doesn't reliably undo it in the headless test harness the repo uses for verification) — otherwise the glow bleeds into the grid, the ghost piece, and the next-piece preview, which are drawn/erased in the same shared `ctx`/`nextCtx`. `drawBlockPastel` uses a `roundRectPath` helper with a manual `arcTo`-based fallback for engines without `ctx.roundRect`.
- **Tuerca (type 8)** — a 3×3 ring with a hollow centre. Its round hole is not board state, it is drawn: `drawNutHole` erases a circle with `globalCompositeOperation = 'destination-out'` (skin-proof — it reveals the CSS `--board-bg` of whichever skin is active, never a color painted on the canvas) *after* the blocks are painted. Locked nuts are found by pattern (`isNutHole`: an empty cell whose 8 neighbours are all `8`), so a nut split by a line clear simply reverts to a square hole. For the current piece and ghost, `carveCurrentNutHole` first checks the centre board cell is empty — a nut can legally straddle an overhanging block, and erasing there would hide a real block.
- **HUD** — the canvas and the DOM HUD are separate. Score/lines/level changes only reach the screen through `updateHUD()`, which the keydown handler calls unconditionally after every input; new code paths that change those values must call it themselves.
- **Difficulty** — `clearLines()` owns scoring *and* progression: `level = floor(lines/10)+1`, `dropInterval = max(100, 1000 - (level-1)*90)`.
- **Restart** — `init()` is the reset function and is called both at startup and by the restart button; anything added to game state must be re-initialized there.

## Gotchas

- Canvas sizes are hardcoded in `index.html` and must match the JS constants: `#board` is `COLS*BLOCK × ROWS*BLOCK` (300×600) and `#next-canvas` assumes a 4×4 grid at 30px (120×120, `NB` in `drawNext`). Changing `COLS`, `ROWS`, or `BLOCK` requires editing the HTML too.
- User-facing strings (overlay text, control list) are Spanish; keep new UI text consistent.
- The tuerca's hole is sealed by its own blocks, so nothing can ever fall into it: the middle row of every locked nut is permanently unclearable. That is deliberate (it is the challenge piece), not a bug — don't "fix" it in `clearLines`.
- `hardDrop` and `softDrop` end in `lockPiece()` → `merge` → `clearLines` → `spawn`; there is no lock delay, so a piece cannot be slid after landing.
- Each skin's grid color is duplicated in two places that must stay in sync: `SKINS[id].grid` in `game.js` (used by the canvas `drawGrid`) and `--grid-color` in the matching `body[data-skin="id"]` block in `style.css` (used by anything CSS-driven). The `<option>` list in `index.html` is likewise a hand-kept mirror of `SKINS`' keys/labels — there's no dynamic generation from `SKINS`, so adding a skin means touching `game.js`, `style.css`, and `index.html`.
- `localStorage.theme` (`'light'`/`'dark'`) is the old pre-skins key from the light/dark toggle; it's read once by `loadInitialSkin()` purely to migrate `'light'` → skin `'claro'` on first load after upgrading. Don't write to it — the live preference key is `tetris.skin`.
