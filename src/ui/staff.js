// ============================================================
// src/ui/staff.js - Partitura
// ============================================================

import { sctx } from './canvas.js';
import { CFG } from '../config.js';
import { song, appMode, pressedKeys } from '../controls/playback.js';
import { getKeyLayout } from './keys.js';

// ===== NOMBRE DE ACORDE =====
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const CHORD_SUFFIXES = {
  0: '', 1: 'm', 2: 'm', 3: 'm', 4: 'M', 5: 'M', 6: 'm', 7: 'dim', 8: 'aug', 9: 'M', 10: 'm', 11: 'dim'
};

export function chordName(notes) {
  const notesArr = notes ? [...notes] : [...pressedKeys];
  if (!notesArr.length) return '';
  const sorted = [...notesArr].sort((a, b) => a - b);
  const root = sorted[0] % 12;
  const intervals = sorted.map(n => (n - root + 12) % 12);
  const hasThird = intervals.includes(4) || intervals.includes(3);
  const hasFifth = intervals.includes(7) || intervals.includes(6);
  const hasSeventh = intervals.includes(10) || intervals.includes(11);
  let name = NOTE_NAMES[root];
  if (hasThird && intervals.includes(4)) name += '';
  else if (hasThird && intervals.includes(3)) name += 'm';
  else if (intervals.includes(8)) name += 'aug';
  else if (intervals.includes(6)) name += 'dim';
  if (hasSeventh) name += '7';
  else if (hasFifth && intervals.includes(6)) name += '5';
  return name;
}

const CLEF_LINES = {
  treble: [77, 74, 71, 67, 64],
  bass: [57, 53, 50, 47, 43]
};

const LETTER_STEP = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
const IS_SHARP = [false, true, false, true, false, false, true, false, true, false, true, false];

function diatonicStep(note) {
  const octave = Math.floor(note / 12) - 1;
  const semitone = note % 12;
  return octave * 7 + LETTER_STEP[semitone];
}

function clefFor(note) {
  return note >= 60 ? 'treble' : 'bass';
}

function pitchToY(note, layout) {
  const clef = clefFor(note);
  const L = layout[clef];
  const refStep = diatonicStep(CLEF_LINES[clef][0]);
  const diff = refStep - diatonicStep(note);
  return L.top + diff * (L.spacing / 2);
}

function hexToRgba(hex, alpha) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '#f2ead9');
  if (!m) return `rgba(242,234,217,${alpha})`;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})`;
}

function drawStaffClef(w, top, spacing, lines, symbol) {
  sctx.strokeStyle = hexToRgba(CFG.staffColors.noteColor, 0.35);
  sctx.lineWidth = 1.4;
  lines.forEach((_, i) => {
    const y = top + i * spacing;
    sctx.beginPath();
    sctx.moveTo(w * 0.09, y);
    sctx.lineTo(w * 0.97, y);
    sctx.stroke();
  });
  sctx.fillStyle = hexToRgba(CFG.staffColors.noteColor, 0.7);
  sctx.font = `${Math.round(spacing * 3.6)}px serif`;
  sctx.textBaseline = 'alphabetic';
  if (symbol === 'treble') sctx.fillText('𝄞', w * 0.015, top + spacing * 3.3);
  else sctx.fillText('𝄢', w * 0.015, top + spacing * 1.9);
}

export function drawStaff() {
  if (!sctx) return;
  const w = sctx.canvas.width,
    h = sctx.canvas.height;
  if (w === 0 || h === 0) return;
  sctx.fillStyle = CFG.staffColors.bgColor;
  sctx.fillRect(0, 0, w, h);

  const freeLabelEl = document.getElementById('freeLabel');
  const layout = {
    treble: { top: h * 0.08, spacing: h * 0.075 },
    bass: { top: h * 0.58, spacing: h * 0.075 }
  };

  // Modo Libre
  if (appMode === 'free') {
    if (!CFG.flags.sheetMusicView.value) {
      if (freeLabelEl) freeLabelEl.style.display = 'none';
      return;
    }
    if (CFG.freeModeDisplay === 'text') {
      if (freeLabelEl) {
        freeLabelEl.style.display = 'flex';
        const chordName = window.chordName || (() => '');
        freeLabelEl.textContent = chordName();
      }
      return;
    }
    if (freeLabelEl) freeLabelEl.style.display = 'none';
    // Dibujar staff con las teclas presionadas
    const spacingFree = h * 0.075;
    const layoutFree = {
      treble: { top: h * 0.08, spacing: spacingFree },
      bass: { top: h * 0.58, spacing: spacingFree }
    };
    drawStaffClef(w, layoutFree.treble.top, spacingFree, CLEF_LINES.treble, 'treble');
    drawStaffClef(w, layoutFree.bass.top, spacingFree, CLEF_LINES.bass, 'bass');
    const cx = w * 0.5;
    (pressedKeys || []).forEach(note => {
      const clef = clefFor(note);
      const L = layoutFree[clef];
      const y = pitchToY(note, layoutFree);
      const topLineY = L.top,
        bottomLineY = L.top + (CLEF_LINES[clef].length - 1) * spacingFree;
      sctx.strokeStyle = hexToRgba(CFG.staffColors.noteColor, 0.3);
      if (y < topLineY - 2) {
        for (let ly = topLineY - spacingFree; ly > y - spacingFree * 0.5; ly -= spacingFree) {
          sctx.beginPath();
          sctx.moveTo(cx - spacingFree * 0.6, ly);
          sctx.lineTo(cx + spacingFree * 0.6, ly);
          sctx.stroke();
        }
      }
      if (y > bottomLineY + 2) {
        for (let ly = bottomLineY + spacingFree; ly < y + spacingFree * 0.5; ly += spacingFree) {
          sctx.beginPath();
          sctx.moveTo(cx - spacingFree * 0.6, ly);
          sctx.lineTo(cx + spacingFree * 0.6, ly);
          sctx.stroke();
        }
      }
      if (IS_SHARP[note % 12]) {
        sctx.fillStyle = CFG.staffColors.noteColor;
        sctx.font = `${Math.round(spacingFree * 0.9)}px serif`;
        sctx.fillText('♯', cx - spacingFree * 1.6, y + spacingFree * 0.3);
      }
      sctx.fillStyle = CFG.staffColors.noteColor;
      sctx.beginPath();
      sctx.ellipse(cx, y, spacingFree * 0.42, spacingFree * 0.32, -0.2, 0, Math.PI * 2);
      sctx.fill();
    });
    return;
  }

  if (freeLabelEl) freeLabelEl.style.display = 'none';
  if (!CFG.flags.sheetMusicView.value || !song.notes || !song.notes.length) return;

  drawStaffClef(w, layout.treble.top, layout.treble.spacing, CLEF_LINES.treble, 'treble');
  drawStaffClef(w, layout.bass.top, layout.bass.spacing, CLEF_LINES.bass, 'bass');

  const t = song.cursorTime || 0;
  const WINDOW = 2.5;
  const cursorX = w * 0.22;
  sctx.strokeStyle = 'rgba(201,162,75,0.55)';
  sctx.lineWidth = 2;
  sctx.beginPath();
  sctx.moveTo(cursorX, layout.treble.top - layout.treble.spacing * 1.5);
  sctx.lineTo(cursorX, layout.bass.top + layout.bass.spacing * 4.5);
  sctx.stroke();

  const trackSettings = window.trackSettings || {};
  song.notes.forEach(n => {
    const trackCfg = trackSettings[n.track];
    if (trackCfg && (trackCfg.visible === false || trackCfg.disabled)) return;
    if (n.start < t - 0.3 || n.start > t + WINDOW) return;
    const x = cursorX + (n.start - t) / WINDOW * (w * 0.74);
    const clef = clefFor(n.note);
    const L = layout[clef];
    const y = pitchToY(n.note, layout);
    const played = n.start < t;
    const semitone = n.note % 12;
    const topLineY = L.top,
      bottomLineY = L.top + (CLEF_LINES[clef].length - 1) * L.spacing;

    sctx.strokeStyle = hexToRgba(CFG.staffColors.noteColor, 0.3);
    if (y < topLineY - 2) {
      for (let ly = topLineY - L.spacing; ly > y - L.spacing * 0.5; ly -= L.spacing) {
        sctx.beginPath();
        sctx.moveTo(x - L.spacing * 0.6, ly);
        sctx.lineTo(x + L.spacing * 0.6, ly);
        sctx.stroke();
      }
    }
    if (y > bottomLineY + 2) {
      for (let ly = bottomLineY + L.spacing; ly < y + L.spacing * 0.5; ly += L.spacing) {
        sctx.beginPath();
        sctx.moveTo(x - L.spacing * 0.6, ly);
        sctx.lineTo(x + L.spacing * 0.6, ly);
        sctx.stroke();
      }
    }
    const noteColor = played ? '#6fbf73' : CFG.staffColors.noteColor;
    if (IS_SHARP[semitone]) {
      sctx.fillStyle = noteColor;
      sctx.font = `${Math.round(L.spacing * 0.9)}px serif`;
      sctx.fillText('♯', x - L.spacing * 1.5, y + L.spacing * 0.3);
    }
    sctx.fillStyle = noteColor;
    sctx.beginPath();
    sctx.ellipse(x, y, L.spacing * 0.42, L.spacing * 0.32, -0.2, 0, Math.PI * 2);
    sctx.fill();

    sctx.strokeStyle = sctx.fillStyle;
    sctx.lineWidth = 1.5;
    const stemUp = y > L.top + (CLEF_LINES[clef].length - 1) * L.spacing / 2;
    sctx.beginPath();
    if (stemUp) {
      sctx.moveTo(x + L.spacing * 0.4, y);
      sctx.lineTo(x + L.spacing * 0.4, y - L.spacing * 2.2);
    } else {
      sctx.moveTo(x - L.spacing * 0.4, y);
      sctx.lineTo(x - L.spacing * 0.4, y + L.spacing * 2.2);
    }
    sctx.stroke();
  });
}