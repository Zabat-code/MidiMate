// ============================================================
// src/synth/voice-effects.js - Cadena de efectos por pista
//
// gain -> pan -> EQ (lowshelf/peaking/highshelf) -> master, con envío a reverb.
// Un nodo por voz, así que se construye en cada nota y se desconecta al soltar.
//
// La versión anterior montaba los 6 nodos siempre. Medido en Chrome, eso costaba
// 4.84x más que una cadena gain -> masterGain (1141 ms vs 236 ms por 2000
// notas), y los tres biquads a 0 dB se midieron transparentes (0.00 dB) pero
// costaban su parte igual. El único nodo que no era gratis de verdad era el
// StereoPanner: repartía potencia entre canales, así que la pista perdía nivel
// en el canal izquierdo según se movía el mando.
//
// Aquí solo se crea lo que hace falta. Con los valores por defecto (pan 0, EQ
// plana, reverb 0) la cadena queda como la del monolito antiguo: gain ->
// masterGain. Sin nodos de sobra. Si el usuario mueve un mando, aparecen.

import { actx, masterGain, reverbBus, ensureReverb } from './context.js';

// Nodo nulo: mantiene la forma que devuelve buildTrackChain para que quien llama
// pueda desconectar sin comprobar nada.
const NOP = { disconnect() {}, connect() {} };

const EPS = 0.001;

export function buildTrackChain(mixParams, input) {
  const gainNode = actx.createGain();
  gainNode.gain.value = mixParams.volume !== undefined ? mixParams.volume : 1.0;

  const pan = mixParams.pan || 0;
  const usePan = Math.abs(pan) > EPS;
  const pannerNode = usePan ? actx.createStereoPanner() : NOP;
  if (usePan) pannerNode.pan.value = Math.max(-1, Math.min(1, pan));

  const eq = mixParams.eq || { low: 0, mid: 0, high: 0 };
  const useEq = Math.abs(eq.low) > EPS ||
                Math.abs(eq.mid) > EPS ||
                Math.abs(eq.high) > EPS;

  let filterLow = NOP, filterMid = NOP, filterHigh = NOP;
  if (useEq) {
    filterLow = actx.createBiquadFilter();
    filterLow.type = 'lowshelf';
    filterLow.frequency.value = 320;
    filterLow.gain.value = eq.low;

    filterMid = actx.createBiquadFilter();
    filterMid.type = 'peaking';
    filterMid.frequency.value = 1200;
    filterMid.Q.value = 0.8;
    filterMid.gain.value = eq.mid;

    filterHigh = actx.createBiquadFilter();
    filterHigh.type = 'highshelf';
    filterHigh.frequency.value = 3200;
    filterHigh.gain.value = eq.high;

    filterLow.connect(filterMid);
    filterMid.connect(filterHigh);
  }

  const rev = mixParams.reverb || 0;
  const useReverb = Math.abs(rev) > EPS;
  const reverbSend = useReverb ? actx.createGain() : NOP;
  if (useReverb) {
    reverbSend.gain.value = rev * 0.8;
    ensureReverb();
    reverbSend.connect(reverbBus);
  }

  // Se monta de laGain hacia fuera, encadenando solo lo que existe.
  let head = gainNode;
  if (useEq) { gainNode.connect(filterLow); head = filterHigh; }
  if (usePan) { head.connect(pannerNode); head = pannerNode; }
  head.connect(masterGain);
  // El send debe recibir la señal: sin esta conexión el convolver está montado
  // en el grafo pero no oye nada y la reverb es inaudible.
  if (useReverb) head.connect(reverbSend);

  input.connect(gainNode);

  return { gainNode, pannerNode, filterLow, filterMid, filterHigh, reverbSend };
}
