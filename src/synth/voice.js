// ============================================================
// src/synth/voice.js - Orquestador de una nota
//
// makeVoice() eran 345 líneas: decidir de dónde sale el sonido, sintetizar,
// montar la cadena de efectos y envolverlo todo en un objeto con su stop().
// Aquí sólo se encadenan; el trabajo está en los tres módulos vecinos.
// ============================================================

import { actx } from './context.js';
import { resolveSampleSource } from './voice-source.js';
import { synthesize } from './voice-synth.js';
import { buildTrackChain } from './voice-effects.js';

export function makeVoice(preset, note, velocity, mixParams) {
  mixParams = mixParams || { volume: 1, pan: 0, detune: 0, reverb: 0, eq: { low: 0, mid: 0, high: 0 } };
  const vol = Math.min(0.28, (velocity / 127) * 0.32);
  const now = actx.currentTime;

  const sample = resolveSampleSource(preset, note);
  const isSample = sample !== null;
  const synth = isSample ? null : synthesize(preset, note, vol, now);

  const { gainNode, pannerNode, filterLow, filterMid, filterHigh, reverbSend } =
    buildTrackChain(mixParams, isSample ? sample : synth.gain);

  const oscs = isSample ? [] : synth.oscs;
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
    source: isSample ? sample : null,
    oscs: isSample ? [] : oscs,
    gain: gainNode,
    stop: (now) => {
      if (isSample) {
        try { sample.stop(now + 0.06); } catch (e) {}
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
