import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULTS, loadConfig, STORAGE_KEY } from '../config.js';

function makeLocalStorageStub() {
  let store = {};
  return {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { store = {}; }
  };
}

beforeEach(() => {
  global.localStorage = makeLocalStorageStub();
});

describe('loadConfig', () => {
  it('devuelve todos los DEFAULTS cuando no hay nada guardado', () => {
    const cfg = loadConfig();
    expect(cfg.tempo).toBe(DEFAULTS.tempo);
    expect(cfg.shortcuts.playPause).toBe('space');
    expect(cfg.countIn.enabled).toBe(DEFAULTS.countIn.enabled);
  });

  it('mezcla una config guardada parcial sin perder claves nuevas de DEFAULTS', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      tempo: 1.5,
      flags: { fallingNotes: { value: false } }
    }));
    const cfg = loadConfig();
    expect(cfg.tempo).toBe(1.5);
    expect(cfg.flags.fallingNotes.value).toBe(false);
    expect(cfg.shortcuts).toBeDefined();
    expect(cfg.shortcuts.playPause).toBe('space');
    expect(cfg.countIn).toBeDefined();
    expect(cfg.countIn.audio).toBe(DEFAULTS.countIn.audio);
    expect(cfg.flags.bpmPulse).toBeDefined();
  });

  it('returns to DEFAULTS if the saved JSON is corrupt', () => {
    localStorage.setItem(STORAGE_KEY, '{esto no es json valido');
    const cfg = loadConfig();
    expect(cfg.tempo).toBe(DEFAULTS.tempo);
    expect(cfg.shortcuts).toBeDefined();
  });

  it('cada propiedad de tipo objeto en DEFAULTS.flags tiene su "value"', () => {
    const cfg = loadConfig();
    Object.values(cfg.flags).forEach(f => {
      expect(f).toHaveProperty('value');
    });
  });
});
