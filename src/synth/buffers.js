// ============================================================
// src/synth/buffers.js - Buffers, helpers de frecuencia y muestras realistas
// ============================================================

import { actx } from './context.js';

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

export function midiNoteToSfName(note) {
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

// `sampleBuffer` se exportaba como `let` y lo reasignaba restoreSampleFromConfig
// desde otro módulo, lo cual es ilegal en ESM. Además el handler de subida del
// drawer asignaba `window.sampleBuffer`, que es un binding distinto del de este
// módulo: una muestra recién subida no sonaba hasta recargar la página, momento
// en que restoreSampleFromConfig() la cargaba desde CFG. Este setter es el único
// camino para cambiar la muestra en caliente.
export function setSampleBuffer(buf) {
  sampleBuffer = buf;
}