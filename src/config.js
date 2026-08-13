// ============================================================
// src/config.js - Configuración y persistencia
// ============================================================

export const STORAGE_KEY = 'recital-config-v6';

export const DEFAULT_KEYMAP = {
  // Blancos en la fila "a".."'" (línea inferior del teclado)
  'a': 60, 's': 62, 'd': 64, 'f': 65, 'g': 67, 'h': 69, 'j': 71, 'k': 72, 'l': 74, ';': 76, "'": 77,
  // Negros en la fila "q".."p" (parte superior)
  'q': 61, 'w': 63, 'e': 66, 'r': 68, 't': 70, 'y': 73, 'u': 75, 'i': 78, 'o': 80, 'p': 82
};

export const TRACK_PALETTE = [
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6',
  '#bcf60c', '#fabebe', '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000', '#aaffc3'
];

export const DEFAULTS = {
  tempo: 1.0,
  volume: 0.8,
  keySkin: 'default',
  visibleKeyCount: 'opt2',
  tileSkin: 'default',
  keyFxStyle: 'ripple',
  colorTheme: 'brass',
  customTheme: null,
  settingsBgColor: '#111',
  panelColor: '#222',
  staffColors: { noteColor: '#fff', bgColor: '#000' },
  staffHeight: 280,
  drawerLayout: 'sidebar',
  uiTheme: 'classic', // 'classic' (default oscuro original) | 'concerthall' (rediseño design.md)
  language: 'en',
  difficultyLevel: 'intermediate',
  difficultyPresets: {
    beginner: {
      keyRange: [48, 72],
      speed: 0.7,
      lookahead: 0.15,
      showBeatLines: true,
      autoHideMouse: true
    },
    intermediate: {
      keyRange: [36, 84],
      speed: 0.9,
      lookahead: 0.12,
      showBeatLines: true,
      autoHideMouse: false
    },
    advanced: {
      keyRange: [21, 108],
      speed: 1.15,
      lookahead: 0.08,
      showBeatLines: false,
      autoHideMouse: false
    }
  },
  flags: {
    fallingNotes: { value: true },
    sheetMusicView: { value: false },
    followMode: { value: true },
    accuracyScoring: { value: true },
    obsCleanMode: { value: false },
    showNoteNames: { value: false },
    showNoteNamesTiles: { value: false },
    showProgressBar: { value: true },
    loopSong: { value: false },
    showBeatLines: { value: true },
    keyPressEffects: { value: true },
    autoHideMouse: { value: true },
    virtualKeyboardClicks: { value: true },
    sustainHold: { value: false },
    perspective3D: { value: false },
    bpmPulse: { value: false },
    dynamicCamera: { value: false },
    showChordNames: { value: false },
    touchMode: { value: true }
  },
  controlVisibility: {
    play: true,
    transport: true,
    midiIn: true,
    tempo: true,
    volume: true,
    fullscreen: true,
    loop: true,
    playlist: true,
    playlistPrev: true,
    playlistNext: true,
    record: true
  },
  background: {
    color: '#000',
    layers: [
      { file: null, type: null, x: 50, y: 50, zoom: 100, opacity: 0.5, order: 'back' },
      { file: null, type: null, x: 50, y: 50, zoom: 100, opacity: 0.5, order: 'middle' },
      { file: null, type: null, x: 50, y: 50, zoom: 100, opacity: 0.5, order: 'front' }
    ]
  },
  perspectiveDepth: 50,
  pulseIntensity: 0.5,
  cameraSmoothing: 0.3,
  eq: { low: 0, mid: 0, high: 0, preset: 'flat' },
  announce: { enabled: true, text: '', font: 'display', size: 32, color: '#f2ead9' },
  countIn: { enabled: false, audio: true },
  toastDuration: 5,
  mouseHideDelay: 2.5,
  noteNaming: 'en',
  freeModeDisplay: 'text',
  staffColors: { noteColor: '#f2ead9', bgColor: '#1c1930' },
  settingsBgColor: '#1c1930',
  panelColor: '#211d38',
  synth: { preset: 'piano', sampleDataUrl: null, sampleBaseNote: 60 },
  metronome: { enabled: false, bpm: 120 },
  keymap: { ...DEFAULT_KEYMAP },
  shortcuts: {
    playPause: 'space',
    sustainToggle: 'shift',
    openFile: '1',
    loopToggle: '2',
    playlistPrev: '3',
    playlistNext: '4',
    playlistToggle: '5',
    recordToggle: '6',
    mute: '7',
    fullscreen: '8',
    stop: '9',
    obsClean: '0',
    seekBack: 'arrowleft',
    seekFwd: 'arrowright',
    volUp: 'arrowup',
    volDown: 'arrowdown'
  },
  humanize: { enabled: false, jitterTime: 15, jitterVel: 10 },
  swing: { amount: 0 },
  trackSettings: {},
  playlist: [],
  harmonizePalette: null,
  bassAmount: 0.3,
  realisticAudio: { enabled: false },
  visibleKeyCount: 'opt2',
  keySkin: 'classic',
  tileSkin: 'classic',
  keyFxStyle: 'flash'
};

export let CFG = null;

function structuredCloneSafe(o) {
  return JSON.parse(JSON.stringify(o));
}

export function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const merged = structuredCloneSafe(DEFAULTS);
    if (!raw) return (CFG = merged);
    const saved = JSON.parse(raw);
    Object.keys(DEFAULTS).forEach(key => {
      if (saved[key] !== undefined) {
        if (typeof DEFAULTS[key] === 'object' && DEFAULTS[key] !== null && !Array.isArray(DEFAULTS[key])) {
          if (typeof saved[key] === 'object' && saved[key] !== null) {
            Object.assign(merged[key], saved[key]);
          }
        } else {
          merged[key] = saved[key];
        }
      }
    });
    if (saved.playlist && Array.isArray(saved.playlist)) merged.playlist = saved.playlist;
    CFG = merged;
    return merged;
  } catch (e) {
    CFG = structuredCloneSafe(DEFAULTS);
    return CFG;
  }
}

export function saveConfig() {
  if (!CFG) return;
  clearTimeout(window._saveTimer);
  window._saveTimer = setTimeout(() => {
    try {
      // Asegurarse de que trackSettings y playlist estén actualizados
      if (window.trackSettings) CFG.trackSettings = window.trackSettings;
      if (window.playlist) CFG.playlist = window.playlist;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(CFG));
    } catch (e) {
      console.warn('No se pudo guardar la configuración:', e);
    }
  }, 200);
}