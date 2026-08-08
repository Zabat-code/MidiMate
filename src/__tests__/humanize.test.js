import { describe, it, expect } from 'vitest';
import { getHumanizedTimeAndVel, applySwing } from '../humanize.js';

describe('getHumanizedTimeAndVel', () => {
  const opts = { enabled: true, jitterTime: 15, jitterVel: 10 };

  it('doesn\'t change anything if humanize is disabled', () => {
    const r = getHumanizedTimeAndVel(1.0, 100, { enabled: false });
    expect(r.time).toBe(1.0);
    expect(r.vel).toBe(100);
  });

  it('es determinista para el mismo input (misma semilla)', () => {
    const a = getHumanizedTimeAndVel(0.5, 80, opts);
    const b = getHumanizedTimeAndVel(0.5, 80, opts);
    expect(a.time).toBeCloseTo(b.time, 10);
    expect(a.vel).toBe(b.vel);
  });

  it('el velocity queda acotado entre 1 y 127', () => {
    // probar con varios tiempos para forzar distintos jitter
    for (let t = 0; t < 5; t += 0.137) {
      const r = getHumanizedTimeAndVel(t, 127, opts);
      expect(r.vel).toBeLessThanOrEqual(127);
      expect(r.vel).toBeGreaterThanOrEqual(1);
    }
  });

  it('velocity 0 se eleva a 1 (no queda en 0)', () => {
    const r = getHumanizedTimeAndVel(2.3, 0, opts);
    expect(r.vel).toBeGreaterThanOrEqual(1);
  });
});

describe('applySwing', () => {
  it('no altera el tiempo si swing es 0', () => {
    expect(applySwing(1.234, 0, 120)).toBe(1.234);
  });

  it('no desplaza notas cerca del inicio del beat (primer cuarto)', () => {
    const beat = 60 / 120; // 0.5s
    const t = 0.1; // dentro del primer 25%
    expect(applySwing(t, 50, 120)).toBe(t);
  });

  it('desplaza notas en la mitad del beat (entre 25% y 75%)', () => {
    const t = 0.3; // 60% del beat a 120bpm
    const r = applySwing(t, 50, 120);
    expect(r).toBeGreaterThan(t);
    // el máximo delay es swing/100 * 0.035 = 0.5*0.035 = 0.0175
    expect(r - t).toBeCloseTo(0.0175, 5);
  });

  it('usa 120 bpm por defecto si no se pasa bpm', () => {
    const t = 0.3;
    const r = applySwing(t, 50); // sin bpm -> 120
    expect(r - t).toBeCloseTo(0.0175, 5);
  });
});
