'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - azul pálido
  '#ffb74d', // L - orange
  '#b0bec5', // Tuerca - gris acero
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // Tuerca (3x3 con agujero)
];

const NUT = 8; // tipo de la tuerca: 3x3 con el centro hueco

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const hsSaveRow = document.getElementById('hs-save-row');
const hsNameInput = document.getElementById('hs-name');
const hsSaveBtn = document.getElementById('hs-save-btn');
const hsRecordsEl = document.getElementById('hs-records');
const hsResetBtn = document.getElementById('hs-reset');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let isLightTheme = false;
let combo, hsSaved, lastSavedEntry;
let records;

const RECORDS_KEY = 'tetris.records';
const MAX_TOP = 5;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * (PIECES.length - 1)) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
  return cleared;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  const cleared = clearLines();
  if (cleared > 0) {
    combo++;
    let changed = false;
    if (combo > records.bestCombo) { records.bestCombo = combo; changed = true; }
    if (lines > records.maxLines) { records.maxLines = lines; changed = true; }
    if (changed) saveRecords();
  } else {
    combo = 0;
  }
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

// Vacía un círculo en el centro de la tuerca; recorta las esquinas interiores
// de los 8 bloques para que el agujero se vea redondo. Usa destination-out
// (borra píxeles) en vez de pintar un color, así vale para ambos temas.
function drawNutHole(context, cx, cy, size) {
  context.save();
  context.globalCompositeOperation = 'destination-out';
  context.beginPath();
  context.arc((cx + 0.5) * size, (cy + 0.5) * size, size * 0.62, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

// Una celda vacía rodeada por los 8 bloques de una tuerca. Si la tuerca se
// parte al eliminarse una línea, el patrón deja de cumplirse y el hueco
// vuelve a verse cuadrado.
function isNutHole(r, c) {
  if (board[r][c] !== 0) return false;
  if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) return false;
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++)
      if ((dr || dc) && board[r + dr][c + dc] !== NUT) return false;
  return true;
}

function drawGrid() {
  ctx.strokeStyle = isLightTheme ? '#d8d8e2' : '#22222e';
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // agujeros de las tuercas ya fijadas (tras pintar todos los bloques)
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (isNutHole(r, c)) drawNutHole(ctx, c, r, BLOCK);

  // tras el game over la pieza que no cupo no se dibuja: quedaría superpuesta al montón
  if (gameOver) return;

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);
  if (current.type === NUT) carveCurrentNutHole(gy);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
  if (current.type === NUT) carveCurrentNutHole(current.y);
}

// El agujero de la tuerca puede caer sobre un bloque ya fijado (collide sólo
// mira las celdas llenas): en ese caso no se borra nada, o se ocultaría un
// bloque real del tablero.
function carveCurrentNutHole(y) {
  const hy = y + 1, hx = current.x + 1;
  if (hy >= 0 && hy < ROWS && board[hy][hx] === 0) drawNutHole(ctx, hx, hy, BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
  if (next.type === NUT) drawNutHole(nextCtx, offX + 1, offY + 1, NB);
}

// --- Tabla de récords (localStorage) ---

function loadRecords() {
  let parsed = null;
  try {
    parsed = JSON.parse(localStorage.getItem(RECORDS_KEY));
  } catch (e) {
    parsed = null;
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.top)) {
    parsed = { top: [], bestCombo: 0, maxLines: 0 };
  }
  const top = parsed.top
    .filter(e => e && typeof e.score === 'number')
    .map(e => ({
      name: typeof e.name === 'string' && e.name ? e.name : 'Jugador',
      score: e.score,
      lines: typeof e.lines === 'number' ? e.lines : 0,
      level: typeof e.level === 'number' ? e.level : 1,
      date: typeof e.date === 'string' ? e.date : '',
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_TOP);
  return {
    top,
    bestCombo: typeof parsed.bestCombo === 'number' ? parsed.bestCombo : 0,
    maxLines: typeof parsed.maxLines === 'number' ? parsed.maxLines : 0,
  };
}

function saveRecords() {
  // localStorage puede fallar (modo privado, cuota excedida, iframe con
  // storage bloqueado); si no se puede persistir, los récords siguen
  // funcionando en memoria durante la partida en curso.
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch (e) {
    /* noop */
  }
}

function qualifiesForTop(s) {
  if (s <= 0) return false;
  if (records.top.length < MAX_TOP) return true;
  return s > records.top[records.top.length - 1].score;
}

function insertRecord(name, s) {
  const entry = { name: name || 'Jugador', score: s, lines, level, date: new Date().toISOString() };
  records.top.push(entry);
  records.top.sort((a, b) => b.score - a.score);
  records.top = records.top.slice(0, MAX_TOP);
  lastSavedEntry = entry;
  saveRecords();
  return entry;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

// Reutilizable: pinta la tabla de récords + resumen (mejor combo, líneas
// máximas) dentro de containerEl. El coordinador la reutiliza también en
// el menú de pausa.
function renderRecords(containerEl) {
  if (!containerEl) return;
  const rows = records.top.map((e, i) => {
    const cls = e === lastSavedEntry ? ' class="hs-new"' : '';
    return `<tr${cls}><td>${i + 1}</td><td>${escapeHtml(e.name)}</td><td>${e.score.toLocaleString()}</td><td>${e.lines}</td><td>${e.level}</td></tr>`;
  }).join('');
  containerEl.innerHTML = `
    <table class="hs-table">
      <thead><tr><th>#</th><th>Nombre</th><th>Puntos</th><th>Líneas</th><th>Nivel</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">Sin récords todavía</td></tr>'}</tbody>
    </table>
    <div class="hs-summary">
      <span>Mejor combo: <b>${records.bestCombo}</b></span>
      <span>Líneas máx: <b>${records.maxLines}</b></span>
    </div>
  `;
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  animId = null;
  draw(); // repinta el tablero final ya con gameOver activo
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  lastSavedEntry = null;
  if (!hsSaved && qualifiesForTop(score)) {
    hsNameInput.value = '';
    hsSaveRow.classList.remove('hidden');
  } else {
    hsSaveRow.classList.add('hidden');
  }
  renderRecords(hsRecordsEl);
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  if (gameOver) return; // lockPiece() pudo terminar la partida: no reprogramar el bucle
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  combo = 0;
  hsSaved = false;
  lastSavedEntry = null;
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  hsSaveRow.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

hsSaveBtn.addEventListener('click', () => {
  if (hsSaved) return;
  const name = (hsNameInput.value || '').trim().slice(0, 12) || 'Jugador';
  insertRecord(name, score);
  hsSaved = true;
  hsSaveRow.classList.add('hidden');
  renderRecords(hsRecordsEl);
});

hsResetBtn.addEventListener('click', () => {
  if (!confirm('¿Borrar todos los récords guardados?')) return;
  records = { top: [], bestCombo: 0, maxLines: 0 };
  lastSavedEntry = null;
  saveRecords();
  renderRecords(hsRecordsEl);
});

function applyTheme() {
  document.body.classList.toggle('light', isLightTheme);
}

isLightTheme = localStorage.getItem('theme') === 'light';
themeToggle.checked = isLightTheme;
applyTheme();

themeToggle.addEventListener('change', () => {
  isLightTheme = themeToggle.checked;
  applyTheme();
  localStorage.setItem('theme', isLightTheme ? 'light' : 'dark');
  draw();
});

records = loadRecords();

init();
