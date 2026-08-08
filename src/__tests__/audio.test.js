import { describe, it, expect } from 'vitest';
import { noteToFreq } from '../audio.js';

describe('noteToFreq', () => {
  it('A4 (nota 69) = 440 Hz', () => {
    expect(noteToFreq(69)).toBeCloseTo(440, 5);
  });

  it('C4 (nota 60) ≈ 261.63 Hz', () => {
    expect(noteToFreq(60)).toBeCloseTo(261.6256, 3);
  });

  it('A3 (nota 57) = 220 Hz (una octava abajo de A4)', () => {
    expect(noteToFreq(57)).toBeCloseTo(220, 5);
  });

  it('subir 12 semitonos duplica la frecuencia', () => {
    const base = noteToFreq(50);
    const oct = noteToFreq(62);
    expect(oct / base).toBeCloseTo(2, 5);
  });

  it('the formula is symmetric: |n-69| octaves from A4', () => {
    expect(noteToFreq(69 + 12)).toBeCloseTo(880, 5);
    expect(noteToFreq(69 - 12)).toBeCloseTo(220, 5);
  });
});
