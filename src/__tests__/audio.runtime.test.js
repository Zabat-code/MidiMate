import { describe, it, expect, beforeAll } from 'vitest';

// ---- Mocks mínimos de Web Audio para ejecutar la lógica real de audio.js ----
const connectLog = [];
function audioParam() {
  return {
    value: 0,
    setValueAtTime() {}, linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {}, cancelScheduledValues() {},
    setTargetAtTime() {}
  };
}
function baseNode() {
  // Node with ALL the audioParams and methods the code might touch.
  const node = {
    _isMockNode: true,
    connect(dest) { connectLog.push(dest); return dest; },
    disconnect() {},
    gain: audioParam(), frequency: audioParam(), Q: audioParam(), detune: audioParam(),
    threshold: audioParam(), knee: audioParam(), ratio: audioParam(),
    attack: audioParam(), release: audioParam(), pan: audioParam(),
    type: '', buffer: null, playbackRate: audioParam(),
    start() {}, stop() {}
  };
  return node;
}
class MockAudioContext {
  constructor() {
    this.sampleRate = 44100; this.currentTime = 0; this.state = 'running';
    this.destination = baseNode();
  }
  createGain() { return baseNode(); }
  createBiquadFilter() { return baseNode(); }
  createConvolver() { return baseNode(); }
  createDynamicsCompressor() { return baseNode(); }
  createStereoPanner() { return baseNode(); }
  createOscillator() { return baseNode(); }
  createBufferSource() { return baseNode(); }
  createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
  decodeAudioData() { return Promise.resolve(baseNode()); }
  resume() { return Promise.resolve(); }
}

beforeAll(() => {
  globalThis.window = {
    AudioContext: MockAudioContext,
    webkitAudioContext: MockAudioContext
  };
  globalThis.caches = {
    open: () => Promise.resolve({ match: () => Promise.resolve(null), put: () => Promise.resolve() })
  };
  const store = {};
  globalThis.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };
});

describe('audio runtime (regression of the Proxy bug in connect)', () => {
  it('makeVoice conecta todos los nodos a nodos reales (no Proxies)', async () => {
    const { loadConfig } = await import('../config.js');
    loadConfig(); // pobla CFG con DEFAULTS (realisticAudio.enabled=false)

    const audio = await import('../audio.js');
    connectLog.length = 0;
    audio.ensureAudio(); // construye el grafo (masterGain/eq/reverb reales)

    const voice = audio.makeVoice('piano', 60, 100, {
      volume: 1, pan: 0, detune: 0, reverb: 0, eq: { low: 0, mid: 0, high: 0 }
    });
    expect(voice).toBeTruthy();
    expect(typeof voice.stop).toBe('function');

    // Cada argumento de connect debe ser un nodo REAL del mock, no un Proxy.
    expect(connectLog.length).toBeGreaterThan(0);
    for (const dest of connectLog) {
      expect(dest && dest._isMockNode).toBe(true); // falla si es un Proxy
    }
  });

  it('startVoice no lanza (flujo completo handleNoteOn -> startVoice -> makeVoice)', async () => {
    const { loadConfig } = await import('../config.js');
    loadConfig();
    const audio = await import('../audio.js');
    connectLog.length = 0;
    audio.ensureAudio();
    // startVoice(note, velocity, mixParams): mixParams con eq completo.
    const mix = { volume: 1, pan: 0, detune: 0, reverb: 0, eq: { low: 0, mid: 0, high: 0 } };
    expect(() => audio.startVoice(60, 100, mix)).not.toThrow();
    for (const dest of connectLog) {
      expect(dest && dest._isMockNode).toBe(true);
    }
  });

  it('actx sigue siendo un Proxy (lazy) pero delega a un contexto real', async () => {
    const audio = await import('../audio.js');
    const ctx = audio.ensureAudio();
    expect(ctx).toBeInstanceOf(MockAudioContext);
    expect(audio.actx.currentTime).toBe(0); // delegation to the real instance
  });
});
