// ============================================================
// src/audio.js - Motor de audio (sintetizador, efectos, mezcla)
// ============================================================

import { CFG, saveConfig, TRACK_PALETTE } from './config.js';
import { t } from './i18.js';

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
  masterCompressor.connect(ctx.destination);

  // ===== REVERB =====
  const _rb = ctx.createGain();
  _rb.gain.value = 1.0;

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
  _rb.connect(_rn);
  _rn.connect(_mg);

  // Asignar a los exports (nodos reales) para que connect() funcione.
  masterGain = _mg;
  eqLow = _el;
  eqMid = _em;
  eqHigh = _eh;
  reverbBus = _rb;
  reverbNode = _rn;
}

// ===== VOICES =====
export const activeVoices = new Map();
export const autoVoices = new Map();

export let sampleBuffer = null;

// ===== HELPERS =====
export function noteToFreq(n) {
  return 440 * Math.pow(2, (n - 69) / 12);
}

let noiseBufferCache = null;
export function getNoiseBuffer() {
  if (noiseBufferCache) return noiseBufferCache;
  const bufferSize = actx.sampleRate * 2;
  const buffer = actx.createBuffer(1, bufferSize, actx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  noiseBufferCache = buffer;
  return buffer;
}

// ===== REALISTIC SAMPLES =====
export const REALISTIC_MAP = {
  piano: 'acoustic_grand_piano',
  grand: 'acoustic_grand_piano',
  upright: 'honkytonk_piano',
  harpsichord: 'harpsichord',
  epiano: 'electric_piano_1',
  violin: 'violin',
  guitarAcoustic: 'acoustic_guitar_steel',
  flute: 'flute',
  organ: 'drawbar_organ',
  pad: 'pad_2_warm',
  bell: 'tubular_bells',
  guitarClassical: 'acoustic_guitar_nylon',
  guitarElectric: 'electric_guitar_clean',
  musicBox: 'music_box',
  perc1: 'synth_drum',
  perc2: 'melodic_tom',
  perc3: 'reverse_cymbal',
  timpani: 'timpani',
  saxophone: 'alto_sax',
  ocarina: 'ocarina',
  brass1: 'trumpet',
  brass2: 'trombone',
  brass3: 'french_horn',
  tuba: 'tuba',
  viola: 'viola',
  cello: 'cello',
  contrabass: 'contrabass',
  clarinet: 'clarinet',
  oboe: 'oboe',
  bassoon: 'bassoon'
};

export const realisticCache = {};
export const SAMPLE_CACHE_NAME = 'recital-samples-v1';

function midiNoteToSfName(note) {
  const names = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const octave = Math.floor(note / 12) - 1;
  return names[note % 12] + octave;
}

export async function loadRealisticSampleFromCacheOrNetwork(instrument, note) {
  const key = instrument + '_' + note;
  
  // Si ya está cargando o hay error, no reintentar
  if (realisticCache[key] === 'loading' || realisticCache[key] === 'error') {
    return realisticCache[key] === 'error' ? null : 'loading';
  }
  
  // Si ya está en cache, retornar
  if (realisticCache[key] && realisticCache[key] !== 'loading') {
    return realisticCache[key];
  }
  
  // Marcar como cargando
  realisticCache[key] = 'loading';
  
  try {
    const cache = await caches.open(SAMPLE_CACHE_NAME);
    const url = `https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/${instrument}-mp3/${midiNoteToSfName(note)}.mp3`;
    let response = await cache.match(url);
    
    if (response) {
      const arrayBuffer = await response.arrayBuffer();
      const decoded = await actx.decodeAudioData(arrayBuffer);
      realisticCache[key] = decoded;
      return decoded;
    }
    
    const fetchResponse = await fetch(url);
    if (!fetchResponse.ok) throw new Error('HTTP error');
    const clone = fetchResponse.clone();
    await cache.put(url, clone);
    const arrayBuffer = await fetchResponse.arrayBuffer();
    const decoded = await actx.decodeAudioData(arrayBuffer);
    realisticCache[key] = decoded;
    return decoded;
  } catch (e) {
    realisticCache[key] = 'error';
    return null;
  }
}

export function tryLoadRealisticSample(preset, note) {
  const instrument = REALISTIC_MAP[preset];
  if (!instrument) return null;
  const key = instrument + '_' + note;
  const cached = realisticCache[key];
  if (cached) {
    if (cached !== 'loading' && cached !== 'error') {
      console.log(`[Realistic] Usando muestra en cache: ${instrument} nota ${note}`);
    }
    return cached;
  }
  realisticCache[key] = 'loading';
  console.log(`[Realistic] Cargando muestra: ${instrument} nota ${note}...`);
  loadRealisticSampleFromCacheOrNetwork(instrument, note)
    .then(decoded => {
      if (decoded) console.log(`[Realistic] ✅ Muestra cargada: ${instrument} nota ${note}`);
      else console.warn(`[Realistic] ❌ Error al cargar: ${instrument} nota ${note}`);
    })
    .catch(() => {});
  return 'loading';
}

// ===== VOICE CREATION =====
export function makeVoice(preset, note, velocity, mixParams) {
  mixParams = mixParams || { volume: 1, pan: 0, detune: 0, reverb: 0, eq: { low: 0, mid: 0, high: 0 } };
  const vol = Math.min(0.28, (velocity / 127) * 0.32);
  const now = actx.currentTime;

  let source = null;
  let isSample = false;

  if (CFG.realisticAudio.enabled && REALISTIC_MAP[preset]) {
    const cached = tryLoadRealisticSample(preset, note);
    if (cached && cached !== 'loading' && cached !== 'error') {
      const src = actx.createBufferSource();
      src.buffer = cached;
      source = src;
      isSample = true;
      console.log(`[Realistic] ▶ Reproduciendo muestra real: ${REALISTIC_MAP[preset]} nota ${note}`);
    } else if (cached === 'loading') {
      console.log(`[Realistic] ⏳ Muestra aún cargando, usando sintetizador: ${preset} nota ${note}`);
    } else {
      console.warn(`[Realistic] ⚠ Muestra no disponible, usando sintetizador: ${preset} nota ${note}`);
    }
  }
  if (!source && preset === 'sample' && sampleBuffer) {
    const src = actx.createBufferSource();
    src.buffer = sampleBuffer;
    src.playbackRate.value = noteToFreq(note) / noteToFreq(CFG.synth.sampleBaseNote);
    source = src;
    isSample = true;
  }

  if (!source) {
    // Síntesis tradicional (todos los presets)
    const gain = actx.createGain();
    gain.gain.setValueAtTime(0, now);
    const oscs = [];
    let voiceOut = gain;

    const STRING_PRESETS = { violin: 3000, viola: 2400, cello: 1800, contrabass: 1300 };
    if (STRING_PRESETS[preset] != null) {
      const stringFilter = actx.createBiquadFilter();
      stringFilter.type = 'lowpass';
      stringFilter.frequency.value = STRING_PRESETS[preset];
      stringFilter.Q.value = 0.7;
      stringFilter.connect(gain);
      voiceOut = stringFilter;
    }

    function osc(type, freqMul, detune, gainMul, delay) {
      const o = actx.createOscillator();
      o.type = type;
      o.frequency.value = noteToFreq(note) * freqMul;
      o.detune.value = (detune || 0) + (Math.random() * 4 - 2);
      const og = actx.createGain();
      og.gain.value = gainMul;
      o.connect(og).connect(voiceOut);
      o.start(now + (delay || 0));
      oscs.push(o);
    }

    function noiseOsc(gainMul, filterType, filterFreq, filterQ, delay) {
      const src = actx.createBufferSource();
      src.buffer = getNoiseBuffer();
      src.loop = true;
      const filt = actx.createBiquadFilter();
      filt.type = filterType;
      filt.frequency.value = filterFreq;
      filt.Q.value = filterQ || 1;
      const og = actx.createGain();
      og.gain.value = gainMul;
      src.connect(filt).connect(og).connect(gain);
      src.start(now + (delay || 0));
      oscs.push(src);
    }

    // ===== PRESETS =====
    if (preset === 'piano') {
      osc('triangle', 1, 0, 1);
      osc('triangle', 2, 3, 0.15);
      osc('sine', 0.5, 0, CFG.bassAmount * 0.35);
      gain.gain.linearRampToValueAtTime(vol, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(Math.max(vol * 0.15, 0.001), now + 1.1);
    } else if (preset === 'grand') {
      osc('triangle', 1, 0, 1);
      osc('sine', 2, 2, 0.3);
      osc('triangle', 3, -2, 0.1);
      osc('sine', 0.5, 0, CFG.bassAmount * 0.4);
      gain.gain.linearRampToValueAtTime(vol, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(Math.max(vol * 0.12, 0.001), now + 1.8);
    } else if (preset === 'upright') {
      osc('sine', 1, 0, 1);
      osc('triangle', 2, 0, 0.12);
      osc('sine', 0.5, 0, CFG.bassAmount * 0.3);
      gain.gain.linearRampToValueAtTime(vol * 0.85, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(Math.max(vol * 0.15, 0.001), now + 0.9);
    } else if (preset === 'harpsichord') {
      osc('sawtooth', 1, 0, 0.6);
      osc('square', 2, 0, 0.25);
      gain.gain.linearRampToValueAtTime(vol, now + 0.002);
      gain.gain.exponentialRampToValueAtTime(Math.max(vol * 0.05, 0.001), now + 0.6);
    } else if (preset === 'epiano') {
      osc('sine', 1, 0, 1);
      osc('sine', 2, 0, 0.25);
      osc('sine', 1, 6, 0.2);
      gain.gain.linearRampToValueAtTime(vol, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(Math.max(vol * 0.2, 0.001), now + 1.6);
    } else if (preset === 'organ') {
      osc('sine', 1, 0, 0.6);
      osc('sine', 2, 0, 0.3);
      osc('sine', 3, 0, 0.15);
      gain.gain.linearRampToValueAtTime(vol, now + 0.02);
    } else if (preset === 'pad') {
      osc('sawtooth', 1, -4, 0.5);
      osc('sawtooth', 1, 4, 0.5);
      gain.gain.linearRampToValueAtTime(vol, now + 0.25);
    } else if (preset === 'bell') {
      osc('sine', 1, 0, 1);
      osc('sine', 2.41, 0, 0.35);
      osc('sine', 3.9, 0, 0.15);
      gain.gain.linearRampToValueAtTime(vol, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(Math.max(vol * 0.1, 0.001), now + 2.2);
    } else if (preset === 'violin') {
      osc('sawtooth', 1, 0, 0.5);
      osc('sawtooth', 1, 7, 0.3);
      osc('sine', 2, 0, 0.15);
      gain.gain.linearRampToValueAtTime(vol, now + 0.12);
      gain.gain.linearRampToValueAtTime(vol * 0.85, now + 0.3);
    } else if (preset === 'viola') {
      osc('sawtooth', 1, 0, 0.5);
      osc('sawtooth', 1, 6, 0.3);
      osc('sine', 1, 0, 0.2);
      gain.gain.linearRampToValueAtTime(vol, now + 0.15);
      gain.gain.linearRampToValueAtTime(vol * 0.85, now + 0.35);
    } else if (preset === 'cello') {
      osc('sawtooth', 1, 0, 0.55);
      osc('triangle', 1, 5, 0.3);
      osc('sine', 0.5, 0, 0.15);
      gain.gain.linearRampToValueAtTime(vol, now + 0.18);
      gain.gain.linearRampToValueAtTime(vol * 0.85, now + 0.4);
    } else if (preset === 'contrabass') {
      osc('sine', 1, 0, 0.6);
      osc('triangle', 1, 4, 0.3);
      osc('sine', 0.5, 0, 0.35);
      gain.gain.linearRampToValueAtTime(vol, now + 0.2);
    } else if (preset === 'guitarClassical') {
      osc('triangle', 1, 0, 1);
      osc('sine', 2, 0, 0.2);
      osc('triangle', 3, 0, 0.06);
      gain.gain.linearRampToValueAtTime(vol, now + 0.004);
      gain.gain.exponentialRampToValueAtTime(Math.max(vol * 0.08, 0.001), now + 1.4);
    } else if (preset === 'guitarAcoustic') {
      osc('triangle', 1, 0, 1);
      osc('triangle', 2, 0, 0.3);
      osc('sine', 3, 0, 0.1);
      gain.gain.linearRampToValueAtTime(vol, now + 0.003);
      gain.gain.exponentialRampToValueAtTime(Math.max(vol * 0.1, 0.001), now + 1.0);
    } else if (preset === 'guitarElectric') {
      osc('sawtooth', 1, 0, 0.7);
      osc('square', 1, 5, 0.25);
      osc('sawtooth', 2, 0, 0.15);
      gain.gain.linearRampToValueAtTime(vol, now + 0.003);
      gain.gain.exponentialRampToValueAtTime(Math.max(vol * 0.2, 0.001), now + 0.8);
    } else if (preset === 'musicBox') {
      osc('sine', 1, 0, 1);
      osc('sine', 4, 0, 0.3);
      osc('sine', 6, 0, 0.12);
      gain.gain.linearRampToValueAtTime(vol, now + 0.002);
      gain.gain.exponentialRampToValueAtTime(Math.max(vol * 0.05, 0.001), now + 1.6);
    } else if (preset === 'perc1') {
      noiseOsc(0.7, 'highpass', 1800, 0.7);
      osc('triangle', 1, 0, 0.3);
      gain.gain.linearRampToValueAtTime(vol, now + 0.001);
      gain.gain.exponentialRampToValueAtTime(Math.max(vol * 0.02, 0.001), now + 0.18);
    } else if (preset === 'perc2') {
      osc('sine', 1, 0, 1);
      osc('triangle', 2, 0, 0.2);
      osc('sine', 0.5, 0, 0.3);
      gain.gain.linearRampToValueAtTime(vol, now + 0.002);
      gain.gain.exponentialRampToValueAtTime(Math.max(vol * 0.03, 0.001), now + 0.35);
    } else if (preset === 'perc3') {
      noiseOsc(0.6, 'highpass', 6000, 0.5);
      gain.gain.linearRampToValueAtTime(vol, now + 0.001);
      gain.gain.exponentialRampToValueAtTime(Math.max(vol * 0.02, 0.001), now + 1.2);
    } else if (preset === 'flute') {
      osc('sine', 1, 0, 1);
      osc('sine', 2, 0, 0.08);
      noiseOsc(0.04, 'bandpass', 2500, 3);
      gain.gain.linearRampToValueAtTime(vol, now + 0.05);
    } else if (preset === 'saxophone') {
      osc('sawtooth', 1, 0, 0.6);
      osc('sawtooth', 1, 4, 0.3);
      gain.gain.linearRampToValueAtTime(vol, now + 0.04);
      gain.gain.linearRampToValueAtTime(vol * 0.8, now + 0.2);
    } else if (preset === 'ocarina') {
      osc('sine', 1, 0, 1);
      gain.gain.linearRampToValueAtTime(vol, now + 0.06);
    } else if (preset === 'brass1') {
      osc('sawtooth', 1, 0, 0.6);
      osc('square', 1, 3, 0.2);
      osc('sawtooth', 2, 0, 0.1);
      gain.gain.linearRampToValueAtTime(vol, now + 0.02);
    } else if (preset === 'brass2') {
      osc('sawtooth', 1, 0, 0.6);
      osc('sawtooth', 0.5, 0, 0.2);
      gain.gain.linearRampToValueAtTime(vol, now + 0.05);
    } else if (preset === 'brass3') {
      osc('triangle', 1, 0, 0.7);
      osc('sine', 2, 0, 0.2);
      gain.gain.linearRampToValueAtTime(vol, now + 0.08);
    } else if (preset === 'tuba') {
      osc('sawtooth', 1, 0, 0.5);
      osc('sine', 0.5, 0, 0.3);
      osc('triangle', 1, 0, 0.2);
      gain.gain.linearRampToValueAtTime(vol, now + 0.09);
    } else if (preset === 'clarinet') {
      osc('square', 1, 0, 0.5);
      osc('sine', 3, 0, 0.1);
      gain.gain.linearRampToValueAtTime(vol, now + 0.05);
    } else if (preset === 'oboe') {
      osc('sawtooth', 1, 0, 0.4);
      osc('square', 2, 0, 0.2);
      osc('sine', 1, 0, 0.2);
      gain.gain.linearRampToValueAtTime(vol, now + 0.04);
    } else if (preset === 'bassoon') {
      osc('sawtooth', 1, 0, 0.5);
      osc('triangle', 2, 0, 0.2);
      gain.gain.linearRampToValueAtTime(vol, now + 0.06);
    } else if (preset === 'timpani') {
      osc('sine', 1, 0, 1);
      osc('sine', 2, 0, 0.2);
      gain.gain.linearRampToValueAtTime(vol, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(Math.max(vol * 0.04, 0.001), now + 0.6);
    } else {
      osc('triangle', 1, 0, 1);
      gain.gain.linearRampToValueAtTime(vol, now + 0.01);
    }

    if (STRING_PRESETS[preset] != null) {
      const lfo = actx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 5.4 + Math.random() * 0.6;
      const lfoGain = actx.createGain();
      lfoGain.gain.setValueAtTime(0, now);
      lfoGain.gain.linearRampToValueAtTime(7, now + 0.4);
      lfo.connect(lfoGain);
      oscs.forEach(o => { if (o.detune) lfoGain.connect(o.detune); });
      lfo.start(now);
      oscs.push(lfo);
    }

    source = { oscs, gain };
  }

  // ===== EFECTOS POR PISTA =====
  const gainNode = actx.createGain();
  gainNode.gain.value = mixParams.volume * 0.8;

  const pannerNode = actx.createStereoPanner();
  pannerNode.pan.value = Math.max(-1, Math.min(1, mixParams.pan));

  const filterLow = actx.createBiquadFilter();
  filterLow.type = 'lowshelf';
  filterLow.frequency.value = 320;
  filterLow.gain.value = mixParams.eq.low;

  const filterMid = actx.createBiquadFilter();
  filterMid.type = 'peaking';
  filterMid.frequency.value = 1200;
  filterMid.Q.value = 0.8;
  filterMid.gain.value = mixParams.eq.mid;

  const filterHigh = actx.createBiquadFilter();
  filterHigh.type = 'highshelf';
  filterHigh.frequency.value = 3200;
  filterHigh.gain.value = mixParams.eq.high;

  const reverbSend = actx.createGain();
  reverbSend.gain.value = mixParams.reverb * 0.8;

  if (isSample) {
    source.connect(gainNode);
    gainNode.connect(pannerNode);
    pannerNode.connect(filterLow);
    filterLow.connect(filterMid);
    filterMid.connect(filterHigh);
    filterHigh.connect(masterGain);
    filterHigh.connect(reverbSend);
    reverbSend.connect(reverbBus);
  } else {
    const gainOsc = source.gain;
    gainOsc.connect(gainNode);
    gainNode.connect(pannerNode);
    pannerNode.connect(filterLow);
    filterLow.connect(filterMid);
    filterMid.connect(filterHigh);
    filterHigh.connect(masterGain);
    filterHigh.connect(reverbSend);
    reverbSend.connect(reverbBus);
  }

  const oscs = isSample ? [] : source.oscs;
  if (!isSample) {
    oscs.forEach(o => {
      if (o.detune) {
        o.detune.value = (o.detune.value || 0) + mixParams.detune;
      }
    });
  }

  const voiceObj = {
    gainNode,
    pannerNode,
    filterLow,
    filterMid,
    filterHigh,
    reverbSend,
    isSample,
    source: isSample ? source : null,
    oscs: isSample ? [] : oscs,
    gain: gainNode,
    stop: (now) => {
      if (isSample) {
        try { source.stop(now + 0.06); } catch (e) {}
      } else {
        oscs.forEach(o => { try { o.stop(now + 0.06); } catch (e) {} });
      }
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(0.0001, now + 0.06);
      setTimeout(() => {
        try {
          gainNode.disconnect();
          pannerNode.disconnect();
          filterLow.disconnect();
          filterMid.disconnect();
          filterHigh.disconnect();
          reverbSend.disconnect();
        } catch (e) {}
      }, 100);
    }
  };

  return voiceObj;
}

// ===== VOICE MANAGEMENT =====
export function releaseVoice(map, key) {
  const v = map.get(key);
  if (!v) return;
  const now = actx.currentTime;
  v.stop(now);
  map.delete(key);
}

export function startVoice(note, velocity, mixParams) {
  const mix = mixParams || { volume: 1, pan: 0, detune: 0, reverb: 0, eq: { low: 0, mid: 0, high: 0 } };
  stopVoice(note);
  // Usar el preset de la pista si existe (para modo libre con pistas), si no el global
  let preset = CFG.synth.preset;
  const trackSettings = window.trackSettings || {};
  // En modo libre no hay pistas, pero si hay trackSettings con preset, usarlo
  if (mixParams && mixParams.track !== undefined && trackSettings[mixParams.track]?.preset) {
    preset = trackSettings[mixParams.track].preset;
  }
  const voice = makeVoice(preset, note, velocity, mix);
  activeVoices.set(note, voice);
}

export function stopVoice(note) {
  releaseVoice(activeVoices, note);
}

export function startAutoVoice(key, preset, note, velocity, mixParams) {
  releaseVoice(autoVoices, key);
  const voice = makeVoice(preset, note, velocity, mixParams);
  autoVoices.set(key, voice);
}

export function stopAutoVoice(key) {
  releaseVoice(autoVoices, key);
}

// ===== METRONOME =====
export function playMetronomeClick() {
  const now = actx.currentTime;
  const osc = actx.createOscillator();
  const g = actx.createGain();
  osc.type = 'square';
  osc.frequency.value = 1500;
  g.gain.setValueAtTime(0.18, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
  osc.connect(g).connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.06);
}

// ===== SAMPLE MANAGEMENT =====
export function populateSampleBaseNoteSelect() {
  const sel = document.getElementById('sampleBaseNote');
  if (!sel) return;
  sel.innerHTML = '';
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  for (let n = 36; n <= 96; n++) {
    const octave = Math.floor(n / 12) - 1;
    const opt = document.createElement('option');
    opt.value = n;
    opt.textContent = NAMES[n % 12] + octave;
    if (n === CFG.synth.sampleBaseNote) opt.selected = true;
    sel.appendChild(opt);
  }
}

export function restoreSampleFromConfig() {
  if (!CFG.synth.sampleDataUrl) return;
  fetch(CFG.synth.sampleDataUrl)
    .then(r => r.arrayBuffer())
    .then(buf => {
      actx.decodeAudioData(buf, decoded => { sampleBuffer = decoded; });
    })
    .catch(() => {});
}

// ===== EQ PRESETS =====
export const EQ_PRESETS = {
  flat: [0, 0, 0],
  rock: [4, -2, 3],
  classical: [2, 0, 3],
  jazz: [3, 1, 1],
  pop: [2, 3, 2],
  electronic: [5, -1, 4],
  vocal: [-1, 4, 2]
};

export function setEqPreset(name) {
  const [low, mid, high] = EQ_PRESETS[name] || EQ_PRESETS.flat;
  CFG.eq.low = low;
  CFG.eq.mid = mid;
  CFG.eq.high = high;
  CFG.eq.preset = name;
  // Los nodos EQ solo existen tras el primer gesto del usuario (grafo lazy).
  // Si aún no se crearon, guardamos los valores en CFG y se aplican al
  // inicializar el audio; no accedemos a .gain para evitar el crash.
  if (eqLow && eqMid && eqHigh) {
    eqLow.gain.value = low;
    eqMid.gain.value = mid;
    eqHigh.gain.value = high;
  }
  document.getElementById('eqLowInput').value = low;
  document.getElementById('eqLowVal').textContent = low + 'dB';
  document.getElementById('eqMidInput').value = mid;
  document.getElementById('eqMidVal').textContent = mid + 'dB';
  document.getElementById('eqHighInput').value = high;
  document.getElementById('eqHighVal').textContent = high + 'dB';
  saveConfig();
}

// ===== ANALYZE MIDI =====
export function analyzeAndOptimizeMidi() {
  const song = window.song || { notes: [], duration: 0, bpm: 120 };
  if (!song.notes || !song.notes.length) {
    window.showToast(t('noMidiToAnalyze'));
    return;
  }

  // Analizar cada pista
  const trackNotesMap = {};
  song.notes.forEach(n => {
    if (!trackNotesMap[n.track]) trackNotesMap[n.track] = [];
    trackNotesMap[n.track].push(n);
  });

  const trackSettings = window.trackSettings || {};
  let totalInstruments = 0;

  Object.keys(trackNotesMap).forEach(trackIdx => {
    const notes = trackNotesMap[trackIdx];
    if (!notes.length) return;
    const avgNote = notes.reduce((s, n) => s + n.note, 0) / notes.length;
    const density = notes.length / Math.max(song.duration, 1);
    let preset = 'piano';
    if (avgNote > 70 && density < 3) preset = 'flute';
    else if (avgNote > 60 && density < 5) preset = 'violin';
    else if (avgNote < 45) preset = 'contrabass';
    else if (density > 10) preset = 'harpsichord';
    else if (density < 2) preset = 'grand';
    else preset = 'upright';
    if (trackSettings[trackIdx]) trackSettings[trackIdx].preset = preset;
    totalInstruments++;
  });

  // EQ global según tempo
  let eqPreset = 'flat';
  if (song.bpm >= 130) eqPreset = 'electronic';
  else if (song.bpm >= 100) eqPreset = 'pop';
  else if (song.bpm <= 75) eqPreset = 'classical';
  else eqPreset = 'jazz';
  setEqPreset(eqPreset);
  document.getElementById('eqPresetSelect').value = eqPreset;

  // Precarga de muestras realistas si está activado
  if (CFG.realisticAudio.enabled) {
    const instruments = new Set();
    Object.values(trackSettings).forEach(cfg => {
      if (REALISTIC_MAP[cfg.preset]) instruments.add(cfg.preset);
    });
    let notesToLoad = [];
    instruments.forEach(preset => {
      const sampleNotes = song.notes.filter(n => trackSettings[n.track] && trackSettings[n.track].preset === preset);
      for (let i = 0; i < Math.min(3, sampleNotes.length); i++) {
        notesToLoad.push({ preset, note: sampleNotes[i].note });
      }
    });
    if (notesToLoad.length) {
      window.showToast(`Precargando ${notesToLoad.length} muestras realistas...`);
      let loaded = 0;
      notesToLoad.forEach(({ preset, note }) => {
        tryLoadRealisticSample(preset, note);
        loaded++;
        if (loaded === notesToLoad.length) {
          window.showToast(`Precarga completada (${loaded} muestras)`);
        }
      });
    }
  }

  // Actualizar panel de pistas
  if (window.buildTracksPanel) window.buildTracksPanel();
  saveConfig();
  // No mostrar mensaje (auto-analisis silencioso al cargar canciones)
}
