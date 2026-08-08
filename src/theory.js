// ============================================================
// src/theory.js - Teoría musical: acordes, tonalidad y análisis
// armónico de la canción completa.
// ============================================================

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// ===== NOMBRE DE ACORDE A PARTIR DE UN CONJUNTO DE NOTAS =====
// (misma lógica que ya existía en ui/staff.js, movida aquí para poder
// reutilizarla también en el análisis de toda la canción)
export function chordFromNotes(notesArr) {
  if (!notesArr || !notesArr.length) return '';
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

// ===== DETECCIÓN DE TONALIDAD (Krumhansl-Schmuckler simplificado) =====
// Compara el histograma de clases de altura (pitch classes) de la canción
// contra los 24 perfiles posibles (12 tonos x mayor/menor) y elige el que
// mejor correlaciona.
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlate(hist, profile) {
  const n = 12;
  const meanH = hist.reduce((a, b) => a + b, 0) / n;
  const meanP = profile.reduce((a, b) => a + b, 0) / n;
  let num = 0, denH = 0, denP = 0;
  for (let i = 0; i < n; i++) {
    const dh = hist[i] - meanH, dp = profile[i] - meanP;
    num += dh * dp;
    denH += dh * dh;
    denP += dp * dp;
  }
  const den = Math.sqrt(denH * denP);
  return den === 0 ? 0 : num / den;
}

export function detectKey(notes) {
  if (!notes || !notes.length) return { tonic: 'C', mode: 'major', label: 'Do mayor' };
  const hist = new Array(12).fill(0);
  notes.forEach(n => {
    const dur = Math.max(0.05, (n.end - n.start) || 0.1);
    hist[n.note % 12] += dur; // ponderado por duración: notas largas pesan más
  });

  let best = { score: -Infinity, tonic: 0, mode: 'major' };
  for (let tonic = 0; tonic < 12; tonic++) {
    const rotatedHist = hist.map((_, i) => hist[(i + tonic) % 12]);
    const majorScore = correlate(rotatedHist, MAJOR_PROFILE);
    const minorScore = correlate(rotatedHist, MINOR_PROFILE);
    if (majorScore > best.score) best = { score: majorScore, tonic, mode: 'major' };
    if (minorScore > best.score) best = { score: minorScore, tonic, mode: 'minor' };
  }

  const tonicName = NOTE_NAMES[best.tonic];
  const modeLabel = best.mode === 'major' ? 'mayor' : 'menor';
  return { tonic: tonicName, mode: best.mode, label: `${tonicName} ${modeLabel}` };
}
