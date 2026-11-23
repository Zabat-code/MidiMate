// ============================================================
// src/synth/context.js - AudioContext y grafo maestro (lazy)
//
// Extraído de audio.js. No importa nada: el AudioContext se construye en el
// primer acceso, no en el import, porque los navegadores dejan el contexto
// "suspended" si se crea sin gesto del usuario.
// ============================================================

// ===== AUDIO CONTEXT (lazy init) =====
// No creamos el AudioContext en el import: los navegadores lo dejan
// "suspended" si se crea sin un gesto del usuario, y a veces no lo resumen
// bien. En su lugar usamos un Proxy que instancia el contexto real en el
// primer acceso (lazy) y delega todas las propiedades/métodos. El código
// existente sigue usando `actx` como antes, sin cambios.
let _actx = null;
function _createActx() {
  if (_actx) return _actx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  _actx = new Ctx();
  _buildAudioGraph(_actx);
  // Reanudar si llegara suspendido (por si el primer acceso no fue un gesto).
  if (_actx.state === 'suspended') _actx.resume().catch(() => {});
  return _actx;
}

export function ensureAudio() {
  return _createActx();
}

export const actx = new Proxy({}, {
  get(_t, prop) {
    const ctx = _createActx();
    const v = ctx[prop];
    return typeof v === 'function' ? v.bind(ctx) : v;
  },
  set(_t, prop, value) {
    _createActx()[prop] = value;
    return true;
  }
});

// ===== MASTER CHAIN (lazy) =====
// Toda la cadena de audio (gain -> EQ -> compressor -> destination, y el
// reverb) se construye DENTRO de _createActx() la primera vez que se accede
// a `actx`. Así el AudioContext y el grafo NO se crean en el import, sino
// cuando la app realmente necesita audio (primer gesto del usuario), evitando
// el problema del contexto "suspended".
// Estos se asignan al nodo real DENTRO de _buildAudioGraph (primer gesto).
// No son proxies: Web Audio exige nodos reales como argumento de connect().
export let masterGain, eqLow, eqMid, eqHigh, reverbBus, reverbNode;

function _buildAudioGraph(ctx) {
  const _mg = ctx.createGain();
  _mg.gain.value = 0.8;

  const _el = ctx.createBiquadFilter();
  _el.type = 'lowshelf';
  _el.frequency.value = 320;
  _el.gain.value = 0;

  const _em = ctx.createBiquadFilter();
  _em.type = 'peaking';
  _em.frequency.value = 1200;
  _em.Q.value = 0.8;
  _em.gain.value = 0;

  const _eh = ctx.createBiquadFilter();
  _eh.type = 'highshelf';
  _eh.frequency.value = 3200;
  _eh.gain.value = 0;

  const masterCompressor = ctx.createDynamicsCompressor();
  masterCompressor.threshold.value = -14;
  masterCompressor.knee.value = 24;
  masterCompressor.ratio.value = 4;
  masterCompressor.attack.value = 0.003;
  masterCompressor.release.value = 0.15;

  _mg.connect(_el);
  _el.connect(_em);
  _em.connect(_eh);
  _eh.connect(masterCompressor);
  // Segunda etapa: limitador brickwall cerca de 0 dBFS (paridad con la web).
  const masterLimiter = ctx.createDynamicsCompressor();
  masterLimiter.threshold.value = -1;
  masterLimiter.knee.value = 0;
  masterLimiter.ratio.value = 20;
  masterLimiter.attack.value = 0.002;
  masterLimiter.release.value = 0.1;
  masterCompressor.connect(masterLimiter);
  masterLimiter.connect(ctx.destination);

  // ===== REVERB (perezoso) =====
  // El bus existe desde el principio, pero NO se conecta al convolver hasta que
  // alguna pista manda algo a reverb. Con la reverb siempre en el grafo maestro
  // costs 1.85x el renderizado (medido: 631 ms frente a 340 ms por 2 s con 8
  // notas), y 31 ms por cada 2 s de audio incluso en silencio. El monolito
  // anterior no tenía reverb, así que esto era coste puro.
  const _rb = ctx.createGain();
  _rb.gain.value = 1.0;

  // Asignar a los exports (nodos reales) para que connect() funcione.
  masterGain = _mg;
  eqLow = _el;
  eqMid = _em;
  eqHigh = _eh;
  reverbBus = _rb;
  reverbNode = null;
}

// Monta el convolver la primera vez que hace falta y lo enchufa al maestro.
// La IR de 1.2 s son 230k muestras que también se dejan de generar si nadie
// usa reverb.
export function ensureReverb() {
  if (reverbNode) return reverbBus;
  const ctx = _createActx();
  const _rn = ctx.createConvolver();
  const impulseLength = ctx.sampleRate * 1.2;
  const impulseBuffer = ctx.createBuffer(2, impulseLength, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulseBuffer.getChannelData(ch);
    for (let i = 0; i < impulseLength; i++) {
      const decay = Math.exp(-i / (ctx.sampleRate * 0.4));
      data[i] = (Math.random() * 2 - 1) * decay;
    }
  }
  _rn.buffer = impulseBuffer;
  reverbBus.connect(_rn);
  _rn.connect(masterGain);
  reverbNode = _rn;
  return reverbBus;
}

// ===== VOICES =====
export const activeVoices = new Map();
export const autoVoices = new Map();