// ============================================================
// src/synth/voice-synth.js - Síntesis de los 27 presets
//
// makeVoice() eran 345 líneas con cuatro responsabilidades atadas. Esta es la
// parte que construye osciladores cuando no hay muestra.
//
// El if/else de abajo es candidato natural a tabla de datos, pero no se ha
// tocado: los tests cubren la conectividad del grafo, no los osciladores de cada
// preset, así que pasarlo a tabla sería reescribir 27 recetas sin red de
// seguridad. Primero se separó, después se decide.
// ============================================================

import { CFG } from '../config.js';
import { actx } from './context.js';
import { noteToFreq, getNoiseBuffer } from './buffers.js';

export function synthesize(preset, note, vol, now) {
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

  // Notas muy graves (por debajo de C#3): armónicos en 2x y 3x. El
  // fundamental de C2 (65 Hz) no existe en altavoces pequeños; estos
  // armónicos sí se reproducen y devuelven la sensación de tono.
  if (note < 49) {
    osc('triangle', 2, 0, 0.16);
    osc('sine', 3, 0, 0.07);
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

  return { oscs, gain };
}