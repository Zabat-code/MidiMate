// ============================================================
// src/synth/voice-source.js - De dónde sale el sonido de una nota
//
// Primero se intenta una muestra real (midi-js-soundfonts, cacheada), luego la
// muestra que haya subido el usuario. Si ninguna está lista, makeVoice() cae en
// la síntesis de voice-synth.js.
// ============================================================

import { CFG } from '../config.js';
import { actx } from './context.js';
import { noteToFreq, sampleBuffer, REALISTIC_MAP, tryLoadRealisticSample } from './buffers.js';

export function resolveSampleSource(preset, note) {
  let source = null;
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

  return source;
}