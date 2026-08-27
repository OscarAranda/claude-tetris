'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

// Paleta por skin: 9 posiciones, null en la 0, tipos 1-8 en el mismo orden
// que PIECES/COLORS de siempre (así una celda se sigue pintando sin saber de
// qué pieza vino). "retro" y "claro" comparten paleta -- solo cambia el
// fondo/CSS -- las otras tres reemplazan también los colores y el renderer.
// retro y claro comparten exactamente esta paleta -- solo cambia el fondo/CSS.
const CLASSIC_COLORS = [null, '#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#90caf9', '#ffb74d', '#b0bec5'];

const SKINS = {
  retro: {
    label: 'Retro (oscuro)',
    render: 'flat',
    grid: '#22222e',
    colors: CLASSIC_COLORS,
  },
  claro: {
    label: 'Claro',
    render: 'flat',
    grid: '#d8d8e2',
    colors: CLASSIC_COLORS,
  },
  neon: {
    label: 'Neón',
    render: 'neon',
    grid: '#16162a',
    colors: [null, '#00e5ff', '#ffee00', '#ff00e6', '#39ff14', '#ff2d55', '#2979ff', '#ff9100', '#b388ff'],
  },
  pastel: {
    label: 'Pastel',
    render: 'pastel',
    grid: '#eee0ea',
    colors: [null, '#aee3e8', '#fff0b3', '#dcc6ea', '#c3e8cd', '#f3c6c6', '#c6d9f0', '#f5d9b8', '#d8d8de'],
  },
  pixel: {
    label: 'Pixel',
    render: 'pixel',
    grid: '#2b2b3a',
    colors: [null, '#00c8d8', '#f8d800', '#c020c0', '#40c840', '#d84030', '#4060d8', '#f08020', '#a0a8b0'],
  },
};
const DEFAULT_SKIN = 'retro';

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
const skinSelect = document.getElementById('skin-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let currentSkin = DEFAULT_SKIN;
let COLORS = SKINS[currentSkin].colors;

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
  clearLines();
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

// Dibuja un trazado de rectángulo redondeado. Usa ctx.roundRect cuando existe
// y si no, lo construye a mano con arcTo (soporte en navegadores antiguos).
function roundRectPath(context, x, y, w, h, r) {
  if (typeof context.roundRect === 'function') {
    context.beginPath();
    context.roundRect(x, y, w, h, r);
    return;
  }
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + w - r, y);
  context.arcTo(x + w, y, x + w, y + r, r);
  context.lineTo(x + w, y + h - r);
  context.arcTo(x + w, y + h, x + w - r, y + h, r);
  context.lineTo(x + r, y + h);
  context.arcTo(x, y + h, x, y + h - r, r);
  context.lineTo(x, y + r);
  context.arcTo(x, y, x + r, y, r);
  context.closePath();
}

// retro / claro: bloque cuadrado plano con un pequeño highlight superior.
function drawBlockFlat(context, x, y, colorIndex, size, alpha) {
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

// neon: fondo oscuro (por CSS) + glow con shadowBlur. El shadowBlur se
// resetea a 0 explícitamente al terminar (no basta con save/restore: en
// algunos contextos -- incluido el arnés de tests -- restore no revierte el
// estado), o el glow se filtraría al grid, al ghost y al preview de "next".
function drawBlockNeon(context, x, y, colorIndex, size, alpha) {
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.shadowColor = color;
  context.shadowBlur = size * 0.5;
  context.fillStyle = color;
  context.fillRect(x * size + 2, y * size + 2, size - 4, size - 4);
  context.shadowBlur = 0;
  context.fillStyle = 'rgba(255,255,255,0.3)';
  context.fillRect(x * size + 2, y * size + 2, size - 4, 3);
  context.globalAlpha = 1;
}

// pastel: colores suaves y esquinas redondeadas.
function drawBlockPastel(context, x, y, colorIndex, size, alpha) {
  const color = COLORS[colorIndex];
  const px = x * size + 1, py = y * size + 1, w = size - 2, h = size - 2;
  const r = Math.max(2, size * 0.18);
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  roundRectPath(context, px, py, w, h, r);
  context.fill();
  context.fillStyle = 'rgba(255,255,255,0.35)';
  context.fillRect(px + r * 0.5, py + 1, w - r, 4);
  context.globalAlpha = 1;
}

// pixel: bloque con una textura de mosaico tipo 8-bit encima del color plano.
function drawBlockPixel(context, x, y, colorIndex, size, alpha) {
  const color = COLORS[colorIndex];
  const px = x * size + 1, py = y * size + 1, w = size - 2, h = size - 2;
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(px, py, w, h);
  const step = Math.max(3, Math.floor(size / 4));
  context.fillStyle = 'rgba(0,0,0,0.18)';
  for (let iy = py; iy < py + h; iy += step * 2)
    for (let ix = px; ix < px + w; ix += step * 2)
      context.fillRect(ix, iy, Math.min(step, px + w - ix), Math.min(step, py + h - iy));
  context.fillStyle = 'rgba(255,255,255,0.3)';
  context.fillRect(px, py, w, 2);
  context.fillStyle = 'rgba(0,0,0,0.35)';
  context.fillRect(px, py + h - 2, w, 2);
  context.globalAlpha = 1;
}

const SKIN_RENDERERS = {
  flat: drawBlockFlat,
  neon: drawBlockNeon,
  pastel: drawBlockPastel,
  pixel: drawBlockPixel,
};

// Delega en el renderer del skin activo; conserva la firma de siempre para
// no tocar las ~15 llamadas repartidas por draw()/drawNext(). Si el nombre de
// renderer de una skin no existe en SKIN_RENDERERS (typo al añadir una skin
// nueva) cae a "flat" en vez de lanzar dentro del loop de requestAnimationFrame.
function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const renderer = SKIN_RENDERERS[SKINS[currentSkin].render] || drawBlockFlat;
  renderer(context, x, y, colorIndex, size, alpha);
}

// Vacía un círculo en el centro de la tuerca; recorta las esquinas interiores
// de los 8 bloques para que el agujero se vea redondo. Usa destination-out
// (borra píxeles) en vez de pintar un color, así vale para las 5 skins: el
// fondo que queda al descubierto es siempre el --board-bg del skin activo
// (CSS), nunca un color pintado en el canvas -- si se rellenara el fondo con
// fillRect en el canvas, el agujero atravesaría hasta el fondo de la página.
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
  ctx.strokeStyle = SKINS[currentSkin].grid;
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

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  animId = null;
  draw(); // repinta el tablero final ya con gameOver activo
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
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
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
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

// La skin es una preferencia persistente, no estado de partida: no se toca
// en init(). Si no hay 'tetris.skin' pero existe el 'theme' del toggle
// antiguo, se migra 'light' -> 'claro' (cualquier otro valor cae a retro).
function loadInitialSkin() {
  const stored = localStorage.getItem('tetris.skin');
  if (stored && SKINS[stored]) return stored;
  if (localStorage.getItem('theme') === 'light') return 'claro';
  return DEFAULT_SKIN;
}

function applySkin() {
  document.body.dataset.skin = currentSkin;
  COLORS = SKINS[currentSkin].colors;
}

currentSkin = loadInitialSkin();
skinSelect.value = currentSkin;
applySkin();

skinSelect.addEventListener('change', () => {
  currentSkin = SKINS[skinSelect.value] ? skinSelect.value : DEFAULT_SKIN;
  applySkin();
  localStorage.setItem('tetris.skin', currentSkin);
  draw();
  drawNext();
});

init();
