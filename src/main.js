// ============================================================
// src/main.js - Punto de entrada
// ============================================================

import './style.css';

// Configuración
import { CFG, loadConfig, saveConfig, DEFAULTS, TRACK_PALETTE } from './config.js';
export { CFG, saveConfig };

// Idiomas
import { t, applyI18n, TEXT } from './i18.js';

// MIDI
import { parseMidi, midiToNotes } from './midi.js';

// Audio
import {
  actx, masterGain, eqLow, eqMid, eqHigh,
  reverbBus, reverbNode,
  activeVoices, autoVoices,
  noteToFreq, getNoiseBuffer,
  makeVoice, releaseVoice, startVoice, stopVoice,
  startAutoVoice, stopAutoVoice,
  ensureAudio,
  playMetronomeClick, tryLoadRealisticSample,
  REALISTIC_MAP, realisticCache, SAMPLE_CACHE_NAME,
  sampleBuffer, restoreSampleFromConfig,
  populateSampleBaseNoteSelect,
  analyzeAndOptimizeMidi,
  setEqPreset
} from './audio.js';

// UI Canvas
import { resizeCanvases, kctx, rctx, sctx } from './ui/canvas.js';

// UI Keys
import { keyLayout, buildKeyLayout, drawKeys, isBlack, noteAtPoint, applyKeyboardRange, setKeyLayout, setKeyState, getKeyLayout } from './ui/keys.js';

// UI Roll
import { drawRoll, drawTile, spawnKeyEffect, drawKeyEffects, heldEffectStart, LOOKAHEAD, CORRECT_RGB, WRONG_RGB } from './ui/roll.js';

// UI Staff
import { drawStaff, chordName } from './ui/staff.js';

// Controls - Drawer
import {
  buildFlagsPanel, buildCtrlVisPanel, buildBgLayersPanel,
  applyFlags, applyControlVisibility, applyBackground, setDrawerOpen,
  FLAG_META, CTRL_META, initDrawerEvents, applyDrawerLayout, openGroup,
  applyDifficultyLevel
} from './controls/drawer.js';

// Controls - Playback
import {
  song, accuracy, appMode, freeNotes,
  applyMode, updatePlayButtonLabel, updateAccuracyBadge,
  updateLoopButton, seekBy, silenceAll, resyncAutoPlayback,
  currentGateNotes, scheduleAutoPlayback,
  frame, startPlaybackLoop,
  toggleMute, setVolume, updateVolIcon,
  showToast, setPlaybackState
} from './controls/playback.js';

// Controls - Transport
import {
  isFullscreen, enterFullscreen, exitFullscreenSafe,
  setTempoValue, seekFromEvent, setStaffHeight, staffMaxHeight,
  initTransportEvents
} from './controls/transport.js';

// Controls - Tracks
import {
  programToPresetName, programToInstrumentName, extractProgramsFromTrack,
  buildTracksPanel
} from './controls/tracks.js';

// Controls - Keyboard (PC y MIDI)
import {
  pressedKeys, autoPressedNotes, hitFeedback,
  keyboardPedalDown, midiPedalDown, sustainedNotes,
  pedalIsDown, releaseSustainedNotes,
  handleNoteOn, handleNoteOff, evaluateHit,
  setupWebMidi, buildKeymapPanel, buildShortcutsPanel,
  listeningForNote, listeningForShortcut,
  initKeyboardEvents
} from './controls/keyboard.js';

// Controls - Eventos globales
import { initGlobalEvents } from './controls/events.js';

// Playlist
import {
  playlist, currentPlaylistIndex,
  loadMidiFile, loadSongData, loadPlaylistAt, renderPlaylist, playNextFromPlaylist,
  syncPlaylistFromConfig, initPlaylistEvents
} from './playlist.js';

// Humanize
import { getHumanizedTimeAndVel, applySwing } from './humanize.js';

// Report
import { initReportButton, usarFuncion, registrarTodas, initGlobalErrorHandling } from './report.js';
import { initPlaylistButton } from './playlist.js';

// Onboarding (tutorial de primer uso)
import { initOnboarding } from './onboarding.js';

// Exportar video
import { initRecordingUI } from './recording.js';

// ============================================================
// 0. MANEJO GLOBAL DE ERRORES (lo primero de todo, antes de tocar el DOM)
// ============================================================
initGlobalErrorHandling();

// ============================================================
// 1. EXPONER GLOBALES
// ============================================================
window.CFG = CFG;
window.saveConfig = saveConfig;
window.t = t;
window.applyI18n = applyI18n;
window.song = song;
window.trackSettings = {};
window.accuracy = accuracy;
window.appMode = appMode;
window.freeNotes = freeNotes;
window.pressedKeys = pressedKeys;
window.autoPressedNotes = autoPressedNotes;
window.hitFeedback = hitFeedback;
window.keyboardPedalDown = keyboardPedalDown;
window.midiPedalDown = midiPedalDown;
window.sustainedNotes = sustainedNotes;
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
window.buildFlagsPanel = buildFlagsPanel;
window.buildCtrlVisPanel = buildCtrlVisPanel;
window.buildBgLayersPanel = buildBgLayersPanel;
window.applyFlags = applyFlags;
window.applyControlVisibility = applyControlVisibility;
window.setDrawerOpen = setDrawerOpen;
window.applyDrawerLayout = applyDrawerLayout;
window.openGroup = openGroup;
window.applyDifficultyLevel = applyDifficultyLevel;
window.drawKeys = drawKeys;
window.drawRoll = drawRoll;
window.drawStaff = drawStaff;
window.resizeCanvases = resizeCanvases;
window.applyKeyboardRange = applyKeyboardRange;
window.loadMidiFile = loadMidiFile;
window.loadSongData = loadSongData;
window.loadPlaylistAt = loadPlaylistAt;
window.renderPlaylist = renderPlaylist;
window.playNextFromPlaylist = playNextFromPlaylist;
window.playlist = playlist;
window.currentPlaylistIndex = currentPlaylistIndex;
window.getHumanizedTimeAndVel = getHumanizedTimeAndVel;
window.applySwing = applySwing;
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
window.keyLayout = keyLayout;
window.buildKeyLayout = buildKeyLayout;
window.isBlack = isBlack;
window.noteAtPoint = noteAtPoint;
window.LOOKAHEAD = LOOKAHEAD;
window.CORRECT_RGB = CORRECT_RGB;
window.WRONG_RGB = WRONG_RGB;
window.spawnKeyEffect = spawnKeyEffect;
window.drawKeyEffects = drawKeyEffects;
window.drawTile = drawTile;
window.heldEffectStart = heldEffectStart;
window.activeVoices = activeVoices;
window.autoVoices = autoVoices;
window.TRACK_PALETTE = TRACK_PALETTE;
window.DEFAULTS = DEFAULTS;
window.loadConfig = loadConfig;
window.parseMidi = parseMidi;
window.midiToNotes = midiToNotes;
window.initReportButton = initReportButton;
window.usarFuncion = usarFuncion;
window.showToast = showToast;
window.setPlaybackState = setPlaybackState;
window.initKeyboardEvents = initKeyboardEvents;
window.initPlaylistEvents = initPlaylistEvents;
window.initDrawerEvents = initDrawerEvents;
window.getKeyLayout = getKeyLayout;
window.setKeyLayout = setKeyLayout;
window.setKeyState = setKeyState;
window.initTransportEvents = initTransportEvents;
window.isFullscreen = isFullscreen;
window.enterFullscreen = enterFullscreen;
window.exitFullscreenSafe = exitFullscreenSafe;
window.setTempoValue = setTempoValue;
window.seekFromEvent = seekFromEvent;
window.setStaffHeight = setStaffHeight;
window.staffMaxHeight = staffMaxHeight;
window.chordName = chordName;
window.buildTracksPanel = buildTracksPanel;
window.programToPresetName = programToPresetName;
window.programToInstrumentName = programToInstrumentName;
window.extractProgramsFromTrack = extractProgramsFromTrack;

// ============================================================
// 2. INICIALIZACIÓN
// ============================================================
function init() {
  console.log('🎹 Starting MidiMate...');

  // Cada bloque va en su propio try/catch: si uno falla, el resto de la app
  // sigue arrancando en vez de quedar todo en blanco (antes, un solo error
  // en cualquier punto de init() cortaba TODO lo que venía después).
  function safeStep(name, fn) {
    try {
      fn();
    } catch (err) {
      console.error(`[PianoApp] Falló el paso de inicio "${name}":`, err);
      try { showToast(`⚠️ Error al iniciar (${name}). Revisa el reporte en Ajustes.`); } catch (e) {}
    }
  }

  safeStep('loadConfig', () => { loadConfig(); syncPlaylistFromConfig(); applyI18n(); });

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
    // Crear el AudioContext de forma perezosa en el primer gesto del usuario
    // (clic/tecla), que es cuando los navegadores permiten arrancar audio.
    const startAudioOnGesture = () => {
      try {
        ensureAudio();
        // Tras el primer gesto los nodos del grafo ya son reales: los exponemos
        // a window para depuración (antes eran undefined porque el grafo es lazy).
        window.masterGain = masterGain;
        window.eqLow = eqLow;
        window.eqMid = eqMid;
        window.eqHigh = eqHigh;
        window.reverbBus = reverbBus;
        window.reverbNode = reverbNode;
      } catch (e) { console.warn('No se pudo iniciar el audio:', e); }
    };
    document.addEventListener('click', startAudioOnGesture, { once: true });
    document.addEventListener('keydown', startAudioOnGesture, { once: true });
  });

  safeStep('extras', () => {
    restoreSampleFromConfig();
    setupWebMidi();
    initReportButton();
    initPlaylistButton();
    initRecordingUI();
    registrarTodas();
  });

  // Estos dos son críticos para que se vea algo en pantalla: van fuera del
  // patrón safeStep individual pero protegidos igual, para asegurarnos de
  // que SIEMPRE se intenten aunque algo anterior haya fallado.
  safeStep('render-inicial', () => {
    resizeCanvases();
    startPlaybackLoop();
  });

  safeStep('onboarding', () => {
    initOnboarding();
  });

  console.log('✅ App iniciada correctamente');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}