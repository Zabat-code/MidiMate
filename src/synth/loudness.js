// Compensación perceptual de graves (idéntica en MidiMate y MidiMate-web).
// Por debajo de C4 el oído pierde sensibilidad al fundamental y los altavoces
// pequeños no reproducen esas frecuencias. Realce gradual, máximo +2.8 dB.
export function lowNoteBoost(note) {
  if (!Number.isFinite(note) || note >= 60) return 1;
  return 1 + Math.min(0.4, (60 - note) * 0.015);
}
