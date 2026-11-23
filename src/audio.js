// ============================================================
// src/audio.js - Fachada del motor de audio
//
// Antes eran 771 líneas con todo dentro. El motor vive ahora en src/synth/:
//
//   context.js        AudioContext lazy, grafo maestro, mapas de voces
//   buffers.js        buffers, noteToFreq, muestras realistas
//   voice-source.js   de dónde sale el sonido de una nota
//   voice-synth.js    los 27 presets
//   voice-effects.js  cadena de efectos por pista
//   voice.js          makeVoice(), que los encadena
//
// Aquí se queda lo que no es síntesis: el ciclo de vida de las voces, el
// metrónomo, el selector de nota base, los presets de EQ y el análisis MIDI.
// Los reexports son para que el resto de la app siga importando de aquí y para
// que window.makeVoice, window.actx, etc. sigan siendo los mismos objetos.
// ============================================================

import { CFG, saveConfig, TRACK_PALETTE } from './config.js';
import { t } from './i18.js';
import { showToast } from './toast.js';
import { song, trackSettings as songTrackSettings } from './song-state.js';

// Ojo: hace falta `import` además de `export ... from`. Un
// `export { eqLow } from './synth/context.js'` reexporta el nombre pero NO crea
// un binding local, así que setEqPreset() vería eqLow como no definida.
import {
  actx,
  masterGain,
  eqLow,
  eqMid,
  eqHigh,
  activeVoices,
  autoVoices
} from './synth/context.js';
import {
  REALISTIC_MAP,
  tryLoadRealisticSample,
  setSampleBuffer
} from './synth/buffers.js';
import { makeVoice } from './synth/voice.js';

export {
  ensureAudio, ensureReverb, actx, masterGain, eqLow, eqMid, eqHigh, reverbBus,
  activeVoices, autoVoices
} from './synth/context.js';

export {
  sampleBuffer, noteToFreq, getNoiseBuffer, REALISTIC_MAP, realisticCache,
  SAMPLE_CACHE_NAME, midiNoteToSfName, loadRealisticSampleFromCacheOrNetwork,
  tryLoadRealisticSample, setSampleBuffer
} from './synth/buffers.js';

export { makeVoice } from './synth/voice.js';

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
  const trackSettings = songTrackSettings;
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
      actx.decodeAudioData(buf, decoded => { setSampleBuffer(decoded); });
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
  if (!song.notes || !song.notes.length) {
    showToast(t('noMidiToAnalyze'));
    return;
  }

  // Analizar cada pista
  const trackNotesMap = {};
  song.notes.forEach(n => {
    if (!trackNotesMap[n.track]) trackNotesMap[n.track] = [];
    trackNotesMap[n.track].push(n);
  });

  const trackSettings = songTrackSettings;
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
      showToast(`Precargando ${notesToLoad.length} muestras realistas...`);
      let loaded = 0;
      notesToLoad.forEach(({ preset, note }) => {
        tryLoadRealisticSample(preset, note);
        loaded++;
        if (loaded === notesToLoad.length) {
          showToast(`Precarga completada (${loaded} muestras)`);
        }
      });
    }
  }

  // Actualizar panel de pistas
  if (window.buildTracksPanel) window.buildTracksPanel();
  saveConfig();
  // No mostrar mensaje (auto-analisis silencioso al cargar canciones)
}