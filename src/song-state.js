// ============================================================
// src/song-state.js - Estado de la canción en curso
// ============================================================

// Este módulo no importa nada, a propósito. Es el hogar del estado que antes
// vivía dentro de playback.js, que es un *controlador* y además el centro del
// grafo de imports: lo importa audio.js, keys.js, roll.js, staff.js, drawer.js
// y transport.js. Como esos módulos también necesitan leer el estado, no podían
// importarlo sin cerrar un ciclo, y la salida era window.* en todas partes.
//
// Separarlo deja el estado en un sitio neutral: los renderizadores y el audio
// leen de aquí, y playback.js sigue siendo el único que lo muta de verdad.
// playback.js reexporta estos nombres, así que los importadores que ya existían
// no cambian.

// La canción activa. Es mutable in-place (se le asignan propiedades), nunca se
// reasigna, así que compartir la referencia es seguro.
export const song = {
  notes: [],
  duration: 0,
  playing: false,
  cursorTime: 0,
  lastFrameTs: null,
  speed: 1.0,
  pendingGate: null,
  bpm: 120,
  countIn: null,
  fileName: null
};

// Sólo se muta in-place ({hits, total}), nunca se reasigna.
export const accuracy = { hits: 0, total: 0 };

// Por pista: color, visible, disabled, auto, preset. Mutado in-place.
export const trackSettings = {};

// Notas tocadas en modo Libre. Sólo se hacen push y se escriben sus campos.
export const freeNotes = [];

// Modo actual. Lo cambia applyMode() (playback.js), que además publica
// window.appMode porque report.js lo lee.
export let appMode = 'free';
export function setAppMode(mode) { appMode = mode; }

export let prevCursorTime = 0;
export function setPrevCursorTime(v) { prevCursorTime = v; }

// Estado de entrada. Son los objetos que setPlaybackState() recibe del
// controlador de teclado; se guardan por referencia porque los Set/Map se
// mutan (clear/add/delete) en el sitio.
export let pressedKeys = new Set();
export let autoPressedNotes = new Set();
export let hitFeedback = new Map();
export let sustainedNotes = new Set();
export let keyboardPedalDown = false;
export let midiPedalDown = false;

export function setPlaybackInput(pressed, auto, hit, sustained) {
  pressedKeys = pressed;
  autoPressedNotes = auto;
  hitFeedback = hit;
  sustainedNotes = sustained;
}

export function setKeyboardPedalDown(value) { keyboardPedalDown = value; }
export function setMidiPedalDown(value) { midiPedalDown = value; }

// El toggle "mantener instrumento en todas las pistas" lo escribe tracks.js y
// lo lee playback.js al recargar un MIDI. Estaba en window.__keepAllPreset sin
// ningún dueño.
let keepAllPreset = false;
export function setKeepAllPreset(value) { keepAllPreset = !!value; }
export function getKeepAllPreset() { return keepAllPreset; }

// Metadatos de pistas del MIDI parseado, incluidas las que no tienen notas,
// para que el panel de pistas pueda nombrarlas. playlist.js lo escribía en
// window._midiTracks y tracks.js lo leía de ahí.
let midiTracks = null;
export function setMidiTracks(tracks) { midiTracks = tracks || null; }
export function getMidiTracks() { return midiTracks; }
