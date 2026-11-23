import { describe, it, expect } from 'vitest';
import { lowNoteBoost } from '../synth/loudness.js';

describe('compensación perceptual de graves', () => {
  it('no toca las notas de C4 en adelante', () => {
    expect(lowNoteBoost(60)).toBe(1);
    expect(lowNoteBoost(72)).toBe(1);
    expect(lowNoteBoost(84)).toBe(1);
  });

  it('realza gradualmente por debajo de C4, con tope', () => {
    expect(lowNoteBoost(48)).toBeCloseTo(1.18, 5);
    expect(lowNoteBoost(36)).toBeCloseTo(1.36, 5);
    expect(lowNoteBoost(21)).toBe(1.4);
  });

  it('tolera valores no numéricos', () => {
    expect(lowNoteBoost(NaN)).toBe(1);
    expect(lowNoteBoost(undefined)).toBe(1);
  });

  it('voice.js aplica el realce al envelope de cada nota', async () => {
    const fuente = (await import('../synth/voice.js?raw')).default;
    expect(fuente).toMatch(/\(velocity \/ 127\) \* 0\.32\) \* lowNoteBoost\(note\)/);
  });
});
