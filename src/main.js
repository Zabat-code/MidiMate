// =====================================================================
// MidiMate — punto de entrada (composition root)
//
// Este fichero hace tres cosas y sólo tres:
//   1. Importa cada módulo una vez, para que exista un único grafo de dependencias.
//   2. Publica en window la superficie que el exterior espera (api-integration,
//      reporte, ?api=1, y el monolito). Ver el bloque "EXPOSICIÓN A window".
//   3. Arranca la app en pasos, cada uno aislado, para que un fallo en un panel
//      no impida que el resto funcione.
//
// No tiene lógica propia de negocio: si necesitas añadir comportamiento, va en
// el módulo que le corresponda, no aquí.
//
// history: este fichero se reconstruyó a partir del bundle del último build
// bueno y del monolito, tras vaciarse por un error de escritura. La estructura
// de abajo (bloque de publicaciones y secuencia de safeStep) es la original.
// =====================================================================

// Configuración
import {
  CFG,
  DEFAULTS,
  TRACK_PALETTE,
  loadConfig,
  saveConfig
} from './config.js';

// Traducciones
import {
  applyI18n,
  t
} from './i18.js';

// Avisos
import {
  showToast
} from './toast.js';

// Estado central de la canción
import {
  accuracy,
  appMode,
  autoPressedNotes,
  freeNotes,
  hitFeedback,
  keyboardPedalDown,
  midiPedalDown,
  pressedKeys,
  song,
  sustainedNotes,
  trackSettings
} from './song-state.js';

// MIDI
import {
  midiToNotes,
  parseMidi
} from './midi.js';

// Humanize
import {
  applySwing,
  getHumanizedTimeAndVel
} from './humanize.js';

// Reporte
import {
  initReportButton,
  registrarTodas,
  usarFuncion
} from './report.js';

// Onboarding
import {
  initOnboarding
} from './onboarding.js';

// Importación/exportación de configuración y lista (paridad con la web)
import { initPlaylistIO } from './playlist-io.js';

// Grabación
import {
  initRecordingUI
} from './recording.js';

// Cliente API
import {
  midimateAPI
} from './api.js';

// Integración API
import {
  initAPIIntegration
} from './api-integration.js';

// Audio
import {
  REALISTIC_MAP,
  SAMPLE_CACHE_NAME,
  activeVoices,
  actx,
  analyzeAndOptimizeMidi,
  autoVoices,
  ensureAudio,
  getNoiseBuffer,
  makeVoice,
  noteToFreq,
  playMetronomeClick,
  populateSampleBaseNoteSelect,
  realisticCache,
  releaseVoice,
  restoreSampleFromConfig,
  sampleBuffer,
  setEqPreset,
  startAutoVoice,
  startVoice,
  stopAutoVoice,
  stopVoice,
  tryLoadRealisticSample
} from './audio.js';

// Lienzos
import {
  resizeCanvases
} from './ui/canvas.js';

// Pista
import {
  CORRECT_RGB,
  LOOKAHEAD,
  WRONG_RGB,
  drawKeyEffects,
  drawRoll,
  drawTile,
  heldEffectStart,
  spawnKeyEffect
} from './ui/roll.js';

// Teclado
import {
  applyKeyboardRange,
  buildKeyLayout,
  drawKeys,
  getKeyLayout,
  isBlack,
  keyLayout,
  noteAtPoint,
  setKeyLayout,
  setKeymapPanelBuilder
} from './ui/keys.js';

// Partitura
import {
  chordName,
  drawStaff
} from './ui/staff.js';

// Panel de ajustes
import {
  applyBackground,
  buildBgLayersPanel
} from './drawer/background.js';
import {
  applyControlVisibility,
  buildCtrlVisPanel
} from './drawer/controls-vis.js';
import { applyFlags, buildFlagsPanel } from './drawer/flags.js';
import {
  applyDrawerLayout,
  openGroup,
  setDrawerOpen
} from './drawer/layout.js';
import { applyDifficultyLevel } from './drawer/difficulty.js';
import { initDrawerEvents } from './drawer/events.js';

// Eventos globales
import {
  initGlobalEvents
} from './controls/events.js';

// Entrada de teclado
import {
  buildKeymapPanel,
  buildShortcutsPanel,
  evaluateHit,
  handleNoteOff,
  handleNoteOn,
  initKeyboardEvents,
  listeningForNote,
  listeningForShortcut,
  pedalIsDown,
  releaseSustainedNotes,
  setupWebMidi
} from './controls/keyboard.js';

// Reproducción
import {
  applyMode,
  currentGateNotes,
  frame,
  resyncAutoPlayback,
  scheduleAutoPlayback,
  seekBy,
  setPlaybackState,
  setVolume,
  silenceAll,
  startPlaybackLoop,
  toggleMute,
  updateAccuracyBadge,
  updateLoopButton,
  updatePlayButtonLabel,
  updateVolIcon
} from './controls/playback.js';

// Pistas
import {
  buildTracksPanel,
  extractProgramsFromTrack,
  programToInstrumentName,
  programToPresetName
} from './controls/tracks.js';

// Transporte
import {
  enterFullscreen,
  exitFullscreenSafe,
  initTransportEvents,
  isFullscreen,
  seekFromEvent,
  setStaffHeight,
  setTempoValue,
  staffMaxHeight
} from './controls/transport.js';

// Lista
import {
  initPlaylistButton,
  initPlaylistEvents,
  loadMidiFile,
  loadPlaylistAt,
  loadSongData,
  playlist,
  currentPlaylistIndex,
  renderPlaylist,
  syncPlaylistFromConfig
} from './playlist.js';

// keys.js necesita reconstruir el panel de keymap cuando cambia el rango, pero no
// puede importar keyboard.js sin cerrar un ciclo con drawer.js. Se conecta aquí,
// que es donde ya conviven los dos. Registrarlo dentro de keyboard.js fallaba con
// "setKeymapPanelBuilder is not a function" por el orden de evaluación del ciclo.
setKeymapPanelBuilder(buildKeymapPanel);

// ===== EXPOSICIÓN A window =====
//
// Esta superficie es deliberada: api-integration.js, el reporte y el
// ?api=1 de la URL leen de window, y el monolito también. No es deuda que
// haya que eliminar de golpe, pero a partir de aquí los módulos NO deben
// escribir en window: leen del store o se importan entre sí.
//
// Ojo con el orden: se publica después de importar todo para que ningún
// paso de arranque encuentre un undefined.

// --- Configuración ---
window.CFG = CFG;
window.saveConfig = saveConfig;
window.TRACK_PALETTE = TRACK_PALETTE;
window.DEFAULTS = DEFAULTS;
window.loadConfig = loadConfig;

// --- Traducciones ---
window.t = t;
window.applyI18n = applyI18n;

// --- Estado central ---
window.song = song;
window.trackSettings = trackSettings;
window.accuracy = accuracy;
window.appMode = appMode;
window.freeNotes = freeNotes;
window.pressedKeys = pressedKeys;
window.autoPressedNotes = autoPressedNotes;
window.hitFeedback = hitFeedback;
window.keyboardPedalDown = keyboardPedalDown;
window.midiPedalDown = midiPedalDown;
window.sustainedNotes = sustainedNotes;

// --- Entrada de teclado ---
window.pedalIsDown = pedalIsDown;
window.releaseSustainedNotes = releaseSustainedNotes;
window.handleNoteOn = handleNoteOn;
window.handleNoteOff = handleNoteOff;
window.evaluateHit = evaluateHit;
window.setupWebMidi = setupWebMidi;
window.buildKeymapPanel = buildKeymapPanel;
window.buildShortcutsPanel = buildShortcutsPanel;
window.listeningForNote = listeningForNote;
window.listeningForShortcut = listeningForShortcut;
window.initKeyboardEvents = initKeyboardEvents;

// --- Reproducción ---
window.applyMode = applyMode;
window.updatePlayButtonLabel = updatePlayButtonLabel;
window.updateAccuracyBadge = updateAccuracyBadge;
window.updateLoopButton = updateLoopButton;
window.seekBy = seekBy;
window.silenceAll = silenceAll;
window.resyncAutoPlayback = resyncAutoPlayback;
window.currentGateNotes = currentGateNotes;
window.scheduleAutoPlayback = scheduleAutoPlayback;
window.frame = frame;
window.startPlaybackLoop = startPlaybackLoop;
window.toggleMute = toggleMute;
window.setVolume = setVolume;
window.updateVolIcon = updateVolIcon;
window.setPlaybackState = setPlaybackState;

// --- Panel de ajustes ---
window.buildFlagsPanel = buildFlagsPanel;
window.buildCtrlVisPanel = buildCtrlVisPanel;
window.buildBgLayersPanel = buildBgLayersPanel;
window.applyFlags = applyFlags;
window.applyControlVisibility = applyControlVisibility;
window.setDrawerOpen = setDrawerOpen;
window.applyDrawerLayout = applyDrawerLayout;
window.openGroup = openGroup;
window.applyDifficultyLevel = applyDifficultyLevel;
window.initDrawerEvents = initDrawerEvents;

// --- Teclado ---
window.drawKeys = drawKeys;
window.applyKeyboardRange = applyKeyboardRange;
window.keyLayout = keyLayout;
window.buildKeyLayout = buildKeyLayout;
window.isBlack = isBlack;
window.noteAtPoint = noteAtPoint;
window.getKeyLayout = getKeyLayout;
window.setKeyLayout = setKeyLayout;

// --- Pista ---
window.drawRoll = drawRoll;
// LOOKAHEAD ahora es estado (setLookahead). Publicarlo con `window.X = X`
// congelaría el valor en el momento del arranque y volvería a crear el bug
// que acabamos de corregir, sólo que en la capa de window. Un getter mantiene
// viva la superficie pública.
Object.defineProperty(window, 'LOOKAHEAD', {
  get: () => LOOKAHEAD,
  configurable: true
});
window.CORRECT_RGB = CORRECT_RGB;
window.WRONG_RGB = WRONG_RGB;
window.spawnKeyEffect = spawnKeyEffect;
window.drawKeyEffects = drawKeyEffects;
window.drawTile = drawTile;
window.heldEffectStart = heldEffectStart;

// --- Partitura ---
window.drawStaff = drawStaff;
window.chordName = chordName;

// --- Lienzos ---
window.resizeCanvases = resizeCanvases;

// --- Lista ---
window.loadMidiFile = loadMidiFile;
window.loadSongData = loadSongData;
window.loadPlaylistAt = loadPlaylistAt;
window.renderPlaylist = renderPlaylist;
window.initPlaylistEvents = initPlaylistEvents;

// --- Humanize ---
window.getHumanizedTimeAndVel = getHumanizedTimeAndVel;
window.applySwing = applySwing;

// --- Audio ---
window.analyzeAndOptimizeMidi = analyzeAndOptimizeMidi;
window.setEqPreset = setEqPreset;
window.populateSampleBaseNoteSelect = populateSampleBaseNoteSelect;
window.restoreSampleFromConfig = restoreSampleFromConfig;
window.actx = actx;
window.startVoice = startVoice;
window.stopVoice = stopVoice;
window.startAutoVoice = startAutoVoice;
window.stopAutoVoice = stopAutoVoice;
window.makeVoice = makeVoice;
window.releaseVoice = releaseVoice;
window.playMetronomeClick = playMetronomeClick;
window.noteToFreq = noteToFreq;
window.getNoiseBuffer = getNoiseBuffer;
window.tryLoadRealisticSample = tryLoadRealisticSample;
window.REALISTIC_MAP = REALISTIC_MAP;
window.realisticCache = realisticCache;
window.SAMPLE_CACHE_NAME = SAMPLE_CACHE_NAME;
window.sampleBuffer = sampleBuffer;
window.activeVoices = activeVoices;
window.autoVoices = autoVoices;

// --- MIDI ---
window.parseMidi = parseMidi;
window.midiToNotes = midiToNotes;

// --- Reporte ---
window.initReportButton = initReportButton;
window.usarFuncion = usarFuncion;

// --- Avisos ---
window.showToast = showToast;

// --- Transporte ---
window.initTransportEvents = initTransportEvents;
window.isFullscreen = isFullscreen;
window.enterFullscreen = enterFullscreen;
window.exitFullscreenSafe = exitFullscreenSafe;
window.setTempoValue = setTempoValue;
window.seekFromEvent = seekFromEvent;
window.setStaffHeight = setStaffHeight;
window.staffMaxHeight = staffMaxHeight;

// --- Pistas ---
window.buildTracksPanel = buildTracksPanel;
window.programToPresetName = programToPresetName;
window.programToInstrumentName = programToInstrumentName;
window.extractProgramsFromTrack = extractProgramsFromTrack;

// =====================================================================
// ARRANQUE
// =====================================================================

// Un paso que falla no puede tumbar la app entera: se registra, se avisa y se
// sigue con el siguiente.
function safeStep(nombre, fn) {
  try {
    fn();
  } catch (err) {
    console.error(`[PianoApp] Falló el paso de inicio "${nombre}":`, err);
    try {
      showToast(`⚠️ Error al iniciar (${nombre}). Revisa el reporte en Ajustes.`);
    } catch { /* si ni los avisos funcionan, no insistimos */ }
  }
}

function init() {
  console.log('🎹 Starting MidiMate...');

  safeStep('loadConfig', () => {
    loadConfig();
    syncPlaylistFromConfig();
    applyI18n();
  });

  // Con ?song= o con la última lista guardada, se carga sola.
  safeStep('autoLoadFirstPlaylist', () => {
    if (playlist.length > 0 && currentPlaylistIndex < 0) loadPlaylistAt(0, false);
  });

  safeStep('eventos', () => {
    initDrawerEvents();
    initKeyboardEvents();
    initPlaylistEvents();
    initTransportEvents();
    initGlobalEvents();
  });

  safeStep('paneles', () => {
    buildFlagsPanel();
    buildCtrlVisPanel();
    buildKeymapPanel();
    buildShortcutsPanel();
    buildBgLayersPanel();
    buildTracksPanel();
    renderPlaylist();
  });

  safeStep('flags-y-fondo', () => {
    applyFlags();
    applyControlVisibility();
    applyBackground();
  });

  safeStep('layout-inicial', () => {
    applyKeyboardRange();
    applyDrawerLayout();
    applyMode('free');
  });

  safeStep('audio-gesture', () => {
    // El navegador no deja crear un AudioContext sin un gesto del usuario, así
    // que el grafo se construye en el primer clic o tecla. Sus nodos son live
    // bindings de audio.js: quien los necesite los importa, no se publican.
    const start = () => {
      try { ensureAudio(); } catch (e) { console.warn('No se pudo iniciar el audio:', e); }
    };
    document.addEventListener('click', start, { once: true });
    document.addEventListener('keydown', start, { once: true });
  });

  safeStep('extras', () => {
    restoreSampleFromConfig();
    populateSampleBaseNoteSelect();
    setupWebMidi();
    initReportButton();
    initPlaylistButton();
    initRecordingUI();
    initPlaylistIO();
    registrarTodas();
  });

  safeStep('render-inicial', () => {
    resizeCanvases();
    startPlaybackLoop();
  });

  safeStep('onboarding', () => {
    initOnboarding();
  });

  console.log('✅ App iniciada correctamente');
}

// Un <script type="module"> es defer, así que el DOM ya está montado cuando
// esto corre. El readyState cubre el caso de que se cargue de otra forma.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// =====================================================================
// API EXTERNA
// =====================================================================

window.midimateAPI = midimateAPI;
window.initAPIIntegration = initAPIIntegration;

function initializeAPIBridge() {
  initAPIIntegration({ autoConnect: new URLSearchParams(location.search).get('api') === '1' });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeAPIBridge, { once: true });
} else {
  initializeAPIBridge();
}
