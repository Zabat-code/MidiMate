// ============================================================
// src/ui/keys.js - Dibujo de teclas
// ============================================================

import { kctx } from './canvas.js';
import { CFG } from '../config.js';
import { currentTheme, CHROMA_COLORS } from '../controls/drawer.js';
import { noteLabelName } from '../i18.js';

// ===== ESTADO =====
export let keyLayout = {};
let pressedKeys = new Set();
let autoPressedNotes = new Set();
let hitFeedback = new Map();
let noteNaming = 'en';
let showNoteNames = false;
let keySkin = 'classic';
let harmonizePalette = null;

// ===== SETTERS =====
export function setKeyState(pressed, auto, feedback) {
  pressedKeys = pressed;
  autoPressedNotes = auto;
  hitFeedback = feedback;
}

export function setKeyLayout(layout) {
  keyLayout = layout;
}

export function getKeyLayout() {
  return keyLayout;
}

// ===== UTILITIES =====
export function isBlack(n) {
  return [1, 3, 6, 8, 10].includes(n % 12);
}

export function buildKeyLayout(lo, hi) {
  const whiteKeys = [];
  for (let n = lo; n <= hi; n++) if (!isBlack(n)) whiteKeys.push(n);
  const whiteW = whiteKeys.length > 0 ? 1 / whiteKeys.length : 0.1;
  const whiteIndex = {};
  whiteKeys.forEach((n, i) => whiteIndex[n] = i);
  const layout = {};
  for (let n = lo; n <= hi; n++) if (!isBlack(n)) layout[n] = { black: false, x: whiteIndex[n] * whiteW, w: whiteW };
  for (let n = lo; n <= hi; n++) {
    if (isBlack(n)) {
      let prevWhite = n - 1;
      while (isBlack(prevWhite) && prevWhite >= lo) prevWhite--;
      const base = layout[prevWhite] ? layout[prevWhite].x + layout[prevWhite].w : 0;
      layout[n] = { black: true, x: base - whiteW * 0.3, w: whiteW * 0.6 };
    }
  }
  return layout;
}

export function applyKeyboardRange() {
  const song = window.song || { notes: [] };
  if (CFG.visibleKeyCount === 'opt2') {
    keyLayout = buildKeyLayout(48, 89);      // Compacto: C3 – F6
  } else if (CFG.visibleKeyCount === 'opt3') {
    keyLayout = buildKeyLayout(36, 101);     // Amplio: C2 – F7
  } else if (CFG.visibleKeyCount === 'opt4') {
    keyLayout = buildKeyLayout(21, 108);     // Todas las teclas (88)
  } else if (CFG.visibleKeyCount === 'auto' || CFG.visibleKeyCount === 'opt5') {
    if (song.notes && song.notes.length) {
      const minN = Math.min(...song.notes.map(n => n.note));
      const maxN = Math.max(...song.notes.map(n => n.note));
      const lo = Math.max(21, minN - 1);
      const hi = Math.min(108, maxN + 1);
      keyLayout = buildKeyLayout(lo, hi);
    } else {
      keyLayout = buildKeyLayout(36, 96);
    }
  } else {
    const count = +CFG.visibleKeyCount || 25;
    const center = (song.notes && song.notes.length)
      ? Math.round((Math.min(...song.notes.map(n => n.note)) + Math.max(...song.notes.map(n => n.note))) / 2)
      : 60;
    let lo = Math.max(21, center - Math.floor(count / 2));
    let hi = Math.min(108, lo + count - 1);
    lo = Math.max(21, hi - count + 1);
    keyLayout = buildKeyLayout(lo, hi);
  }
  if (window.buildKeymapPanel) window.buildKeymapPanel();
}

export function noteAtPoint(px, py) {
  // Usar las dimensiones CSS del canvas (getBoundingClientRect) en lugar de
  // las internas (canvas.width), que son 2x más grandes por el DPR scaling.
  // Esto garantiza que las coordenadas de mouse/touch coincidan con las teclas.
  const canvas = kctx?.canvas;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width || 0;
  const h = rect.height || 0;
  if (!w || !h) return null;
  const relY = py / h;
  for (const [n, k] of Object.entries(keyLayout)) {
    if (k.black && relY < 0.44 && px >= k.x * w && px <= (k.x + k.w) * w) return +n;
  }
  for (const [n, k] of Object.entries(keyLayout)) {
    if (!k.black && px >= k.x * w && px <= (k.x + k.w) * w) return +n;
  }
  return null;
}

function getChromaColor(note) {
  return CHROMA_COLORS[note % 12] || '255,255,255';
}

export function drawKeys() {
  if (!kctx) return;
  const w = kctx.canvas.width,
    h = kctx.canvas.height;
  if (w === 0 || h === 0) return;
  const blackH = h * 0.44;
  // Usar CFG.keySkin directamente (la variable local keySkin nunca se actualiza)
  const skin = CFG.keySkin || 'classic';
  const theme = currentTheme();
  const palette = harmonizePalette || CFG.harmonizePalette || null;
  const naming = CFG.noteNaming || 'en';
  const showNames = showNoteNames || CFG.flags.showNoteNames.value || false;
  // Usar window.pressedKeys directamente (setKeyState nunca se llama)
  const pressed = window.pressedKeys || new Set();
  const autoPressed = window.autoPressedNotes || new Set();
  const feedback = window.hitFeedback || new Map();
  const remapPreview = (window.remapPreviewNote != null) ? window.remapPreviewNote : -1;
  const isDown = (note) => pressed.has(note) || autoPressed.has(note) || note === remapPreview;
  const fb = (note) => feedback.get(note);

  kctx.clearRect(0, 0, w, h);

  // Teclas blancas
  Object.entries(keyLayout).forEach(([note, k]) => {
    note = +note;
    if (k.black) return;
    const x = k.x * w,
      kw = k.w * w;
    const fb = feedback.get(note);
    const isDown = pressed.has(note) || autoPressed.has(note) || note === remapPreview;
    let color = '#f2ead9';
    if (skin === 'chroma') {
      // Chroma: color de nota, pero al presionar se ilumina (mezcla con blanco)
      const base = getChromaColor(note);
      color = isDown ? `rgb(255,255,255)` : `rgb(${base})`;
    } else if (isDown) {
      // Tecla presionada: color dorado brillante muy visible
      color = fb?.color || '#e0bd6d';
    } else if (fb && fb.until > performance.now()) color = fb.color;

    if (skin === 'neon') {
      kctx.fillStyle = '#15121f';
      kctx.fillRect(x, 0, kw - 1, h);
      kctx.shadowColor = color;
      kctx.shadowBlur = 12;
      kctx.strokeStyle = color;
      kctx.lineWidth = 2;
      kctx.strokeRect(x + 1, 1, kw - 3, h - 2);
      kctx.shadowBlur = 0;
      if (isDown || (fb && fb.until > performance.now())) {
        kctx.fillStyle = color;
        kctx.globalAlpha = 0.6;
        kctx.fillRect(x + 2, 2, kw - 5, h - 4);
        kctx.globalAlpha = 1;
      }
    } else if (skin === 'flat') {
      kctx.fillStyle = color;
      kctx.fillRect(x, 0, kw - 1, h);
      kctx.strokeStyle = 'rgba(20,18,31,0.25)';
      kctx.lineWidth = 1;
      kctx.strokeRect(x, 0, kw - 1, h);
    } else if (skin === 'harmonize') {
      const letterIdx = [0, 2, 4, 5, 7, 9, 11].indexOf(note % 12);
      const paletteColor = (palette && letterIdx >= 0) ? palette[letterIdx] : color;
      kctx.fillStyle = isDown ? color : paletteColor;
      kctx.fillRect(x, 0, kw - 1, h);
      kctx.strokeStyle = 'rgba(20,18,31,0.4)';
      kctx.lineWidth = 1;
      kctx.strokeRect(x, 0, kw - 1, h);
    } else {
      kctx.fillStyle = color;
      kctx.fillRect(x, 0, kw - 1, h);
      const grad = kctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(255,255,255,0.5)');
      grad.addColorStop(0.06, 'rgba(255,255,255,0.15)');
      grad.addColorStop(0.14, 'rgba(255,255,255,0)');
      grad.addColorStop(0.88, 'rgba(0,0,0,0.05)');
      grad.addColorStop(0.96, 'rgba(0,0,0,0.2)');
      grad.addColorStop(1, 'rgba(0,0,0,0.4)');
      kctx.fillStyle = grad;
      kctx.fillRect(x, 0, kw - 1, h);
      kctx.strokeStyle = 'rgba(20,18,31,0.15)';
      kctx.lineWidth = 1;
      kctx.strokeRect(x + 0.5, 0.5, kw - 2, h - 1);
      kctx.strokeStyle = 'rgba(20,18,31,0.5)';
      kctx.lineWidth = 1.2;
      kctx.strokeRect(x, 0, kw - 1, h);
    }
    if (showNames) {
      kctx.fillStyle = skin === 'neon' ? 'rgba(242,234,217,0.5)' : 'rgba(16,14,26,0.65)';
      kctx.font = `${Math.round(kw * 0.42)}px sans-serif`;
      kctx.textAlign = 'center';
      kctx.fillText(noteLabelName(note, naming), x + kw / 2, h - 8);
    }
  });

  // Teclas negras
  Object.entries(keyLayout).forEach(([note, k]) => {
    note = +note;
    if (!k.black) return;
    const x = k.x * w,
      kw = k.w * w;
    const fb = feedback.get(note);
    const isDown = pressed.has(note) || autoPressed.has(note) || note === remapPreview;
    let color = '#100e1a';
    if (skin === 'chroma') {
      // Chroma: tecla negra se ilumina al presionar
      color = isDown ? `rgb(255,255,255)` : `rgb(${getChromaColor(note)})`;
    } else if (isDown) {
      // Tecla negra presionada: dorado brillante muy visible
      color = fb?.color || '#e0bd6d';
    } else if (fb && fb.until > performance.now()) color = fb.color;

    if (skin === 'neon') {
      kctx.fillStyle = '#050408';
      kctx.fillRect(x, 0, kw, blackH);
      kctx.shadowColor = color;
      kctx.shadowBlur = 8;
      kctx.strokeStyle = color;
      kctx.lineWidth = 1.5;
      kctx.strokeRect(x + 1, 1, kw - 2, blackH - 2);
      kctx.shadowBlur = 0;
      if (isDown || (fb && fb.until > performance.now())) {
        kctx.fillStyle = color;
        kctx.globalAlpha = 0.7;
        kctx.fillRect(x + 2, 2, kw - 4, blackH - 4);
        kctx.globalAlpha = 1;
      }
    } else if (skin === 'flat' || skin === 'harmonize') {
      kctx.fillStyle = color;
      kctx.fillRect(x, 0, kw, blackH);
    } else {
      kctx.fillStyle = color;
      kctx.fillRect(x, 0, kw, blackH);
      const grad = kctx.createLinearGradient(0, 0, 0, blackH);
      grad.addColorStop(0, 'rgba(255,255,255,0.15)');
      grad.addColorStop(1, 'rgba(0,0,0,0.3)');
      kctx.fillStyle = grad;
      kctx.fillRect(x, 0, kw, blackH);
    }
    if (showNames) {
      kctx.fillStyle = 'rgba(242,234,217,0.8)';
      kctx.font = `${Math.round(kw * 0.5)}px sans-serif`;
      kctx.textAlign = 'center';
      kctx.fillText(noteLabelName(note, naming), x + kw / 2, blackH - 6);
    }
  });
}