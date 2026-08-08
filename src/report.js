// ============================================================
// src/report.js - Reporte de funciones y estado de la app
// ============================================================

import { CFG } from './config.js';
import { showToast } from './controls/playback.js';

// ===== MANEJO GLOBAL DE ERRORES =====
// Captura cualquier error no controlado (JS o promesas rechazadas) para que
// la app nunca se quede en pantalla en blanco sin avisar. Los errores se
// guardan en un log en memoria que se incluye en el reporte descargable.
const ERROR_LOG = [];
const MAX_ERROR_LOG = 30;
let lastErrorToastAt = 0;

function pushError(message, detail) {
  ERROR_LOG.push({ time: new Date().toISOString(), message: String(message || 'Error desconocido'), detail: detail || '' });
  if (ERROR_LOG.length > MAX_ERROR_LOG) ERROR_LOG.shift();
  console.error('[PianoApp]', message, detail || '');
  // Evitar spamear toasts si varios errores ocurren seguidos (p. ej. dentro de un loop)
  const now = Date.now();
  if (now - lastErrorToastAt > 4000) {
    lastErrorToastAt = now;
    try {
      showToast('⚠️ Algo falló. Si la app deja de responder, recarga la página (F5). Puedes generar un reporte en Ajustes.');
    } catch (e) {
      // If showToast also fails (e.g. DOM not ready yet), do nothing more.
    }
  }
}

export function initGlobalErrorHandling() {
  window.addEventListener('error', e => {
    const loc = e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : '';
    pushError(e.message || (e.error && e.error.message), (e.error && e.error.stack) || loc);
  });
  window.addEventListener('unhandledrejection', e => {
    const reason = e.reason;
    pushError((reason && reason.message) || String(reason), reason && reason.stack);
  });
}

export function getErrorLog() {
  return ERROR_LOG;
}


// ===== REGISTRO DE FUNCIONES =====
const FUNCIONES_REGISTRO = {};

export function registrarFuncion(nombre, descripcion, categoria) {
  if (!FUNCIONES_REGISTRO[nombre]) {
    FUNCIONES_REGISTRO[nombre] = { nombre, descripcion, categoria, usos: 0 };
  }
}

export function usarFuncion(nombre) {
  const fn = FUNCIONES_REGISTRO[nombre];
  if (fn) fn.usos++;
}

// ===== REGISTRAR TODAS LAS FUNCIONES REALES =====
export function registrarTodas() {
  // Core
  registrarFuncion('registrarFuncion', 'Registers a function in the report system', 'Core');
  registrarFuncion('initReportButton', 'Initializes the report button', 'Core');
  registrarFuncion('usarFuncion', 'Marks a function as used (counter)', 'Core');
  registrarFuncion('loadConfig', 'Loads configuration from localStorage', 'Core');
  registrarFuncion('saveConfig', 'Saves configuration to localStorage', 'Core');

  // Audio
  registrarFuncion('actx', 'AudioContext (motor de audio Web Audio API)', 'Audio');
  registrarFuncion('masterGain', 'Nodo de ganancia maestro', 'Audio');
  registrarFuncion('startVoice', 'Inicia una nota (voice) sintetizada', 'Audio');
  registrarFuncion('stopVoice', 'Detiene una nota (voice) sintetizada', 'Audio');
  registrarFuncion('startAutoVoice', 'Starts an automatic playback note', 'Audio');
  registrarFuncion('stopAutoVoice', 'Stops an automatic playback note', 'Audio');
  registrarFuncion('noteToFreq', 'Convierte nota MIDI a frecuencia Hz', 'Audio');
  registrarFuncion('setEqPreset', 'Aplica preset de ecualizador', 'Audio');
  registrarFuncion('analyzeAndOptimizeMidi', 'Analiza y optimiza sonido del MIDI', 'Audio');
  registrarFuncion('tryLoadRealisticSample', 'Carga muestra de sonido realista', 'Audio');
  registrarFuncion('playMetronomeClick', 'Plays the metronome click', 'Audio');

  // UI Canvas / Teclas / Roll / Staff
  registrarFuncion('resizeCanvases', 'Redimensiona todos los canvas', 'UI');
  registrarFuncion('drawKeys', 'Dibuja el teclado virtual', 'UI');
  registrarFuncion('drawRoll', 'Dibuja las notas cayendo (roll)', 'UI');
  registrarFuncion('drawStaff', 'Dibuja la partitura (pentagrama)', 'UI');
  registrarFuncion('spawnKeyEffect', 'Genera efecto visual al tocar una tecla', 'UI');
  registrarFuncion('buildKeyLayout', 'Construye el layout de teclas', 'UI');
  registrarFuncion('applyKeyboardRange', 'Adjusts key range according to the MIDI', 'UI');
  registrarFuncion('setKeyLayout', 'Establece el layout de teclas', 'UI');

  // Controles - Playback
  registrarFuncion('togglePlay', 'Toggles play / pause', 'Controles');
  registrarFuncion('stopPlayback', 'Stops playback', 'Controles');
  registrarFuncion('seekBy', 'Salta -5s / +5s', 'Controles');
  registrarFuncion('toggleMute', 'Silencia / restaura volumen', 'Controles');
  registrarFuncion('setVolume', 'Establece el volumen', 'Controles');
  registrarFuncion('applyMode', 'Cambia el modo (libre/ver/practicar)', 'Controles');
  registrarFuncion('updatePlayButtonLabel', 'Updates the play button label', 'Controles');
  registrarFuncion('updateLoopButton', 'Updates the loop button', 'Controles');
  registrarFuncion('setPlaybackState', 'Synchronizes note state between modules', 'Controles');
  registrarFuncion('scheduleAutoPlayback', 'Schedules automatic playback notes', 'Controles');
  registrarFuncion('startPlaybackLoop', 'Starts the animation loop', 'Controles');

  // Controles - Transport
  registrarFuncion('setTempoValue', 'Cambia el tempo/velocidad', 'Controles');
  registrarFuncion('seekFromEvent', 'Seek from mouse position on progress bar', 'Controles');
  registrarFuncion('setStaffHeight', 'Cambia la altura de la partitura', 'Controles');
  registrarFuncion('enterFullscreen', 'Entra en pantalla completa', 'Controles');
  registrarFuncion('exitFullscreenSafe', 'Sale de pantalla completa', 'Controles');
  registrarFuncion('isFullscreen', 'Checks if in fullscreen', 'Controles');

  // Controles - Drawer / Flags
  registrarFuncion('buildFlagsPanel', 'Builds the flags panel', 'Configuration');
  registrarFuncion('buildCtrlVisPanel', 'Builds the control-visibility panel', 'Configuration');
  registrarFuncion('buildBgLayersPanel', 'Builds the background-layers panel', 'Configuration');
  registrarFuncion('buildKeymapPanel', 'Builds the PC keyboard keymap panel', 'Configuration');
  registrarFuncion('buildShortcutsPanel', 'Builds the shortcuts panel', 'Configuration');
  registrarFuncion('buildTracksPanel', 'Builds the per-track instruments panel', 'Configuration');
  registrarFuncion('buildTracksPanel', 'Builds the per-track instruments panel', 'Configuration');
  registrarFuncion('applyFlags', 'Applies flags (view, tracking, etc.)', 'Configuration');
  registrarFuncion('applyControlVisibility', 'Applies control visibility', 'Configuration');
  registrarFuncion('applyDrawerLayout', 'Applies the drawer layout', 'Configuration');
  registrarFuncion('setDrawerOpen', 'Opens/closes the settings drawer', 'Configuration');
  registrarFuncion('applyColorTheme', 'Changes the color theme', 'Configuration');
  registrarFuncion('harmonizeWithImage', 'Harmonizes colors with the background image', 'Configuration');

  // Playlist
  registrarFuncion('loadMidiFile', 'Carga un archivo MIDI', 'Playlist');
  registrarFuncion('loadSongData', 'Loads song data into memory', 'Playlist');
  registrarFuncion('loadPlaylistAt', 'Carga una pista de la playlist', 'Playlist');
  registrarFuncion('renderPlaylist', 'Renders the playlist', 'Playlist');
  registrarFuncion('playNextFromPlaylist', 'Avanza a la siguiente pista', 'Playlist');
  registrarFuncion('syncPlaylistFromConfig', 'Sincroniza playlist desde config', 'Playlist');

  // Teclado / MIDI
  registrarFuncion('handleNoteOn', 'Maneja nota ON (teclado PC o MIDI)', 'Teclado/MIDI');
  registrarFuncion('handleNoteOff', 'Maneja nota OFF', 'Teclado/MIDI');
  registrarFuncion('evaluateHit', 'Evaluates accuracy in Practice mode', 'Teclado/MIDI');
  registrarFuncion('setupWebMidi', 'Inicializa Web MIDI API', 'Teclado/MIDI');
  registrarFuncion('noteAtPoint', 'Obtiene nota MIDI desde coordenadas del canvas', 'Teclado/MIDI');
  registrarFuncion('resetKeymap', 'Restablece keymap por defecto', 'Teclado/MIDI');

  // MIDI parsing
  registrarFuncion('parseMidi', 'Parsea datos de archivo MIDI', 'Core');
  registrarFuncion('midiToNotes', 'Convierte MIDI parseado a notas', 'Core');
  registrarFuncion('extractProgramsFromTrack', 'Extrae programas (instrumentos) de una pista', 'Core');
  registrarFuncion('programToPresetName', 'Convierte programa MIDI a preset de sintetizador', 'Core');
  registrarFuncion('programToInstrumentName', 'Convierte programa MIDI a nombre de instrumento', 'Core');
}

// ===== ESTADO ACTUAL DE LA APP =====
function getAppState() {
  const parts = [];

  // AudioContext
  const actx = window.actx;
  parts.push('AudioContext: ' + (actx ? actx.state : 'N/A'));
  parts.push('Sample rate: ' + (actx ? actx.sampleRate : 'N/A') + ' Hz');

  // Song
  const song = window.song;
  if (song) {
    parts.push('');
    parts.push('--- SONG ---');
    parts.push('Archivo: ' + (song.fileName || '(ninguno)'));
    parts.push('Duration: ' + formatTime(song.duration || 0));
    parts.push('BPM: ' + (song.bpm || 120));
    parts.push('Notas: ' + (song.notes?.length || 0));
    const tracks = song.notes ? [...new Set(song.notes.map(n => n.track))] : [];
    parts.push('Tracks: ' + tracks.length);
    parts.push('Modo: ' + (window.appMode || 'free'));
    parts.push('Playing: ' + (song.playing ? 'Yes' : 'No'));
    parts.push('Cursor: ' + formatTime(song.cursorTime || 0));
    parts.push('Tempo: ' + Math.round((CFG?.tempo || 1) * 100) + '%');
    parts.push('Volumen: ' + Math.round((CFG?.volume || 0.8) * 100) + '%');
  }

  // MIDI
  parts.push('');
  parts.push('--- MIDI ---');
  const midiSel = document.getElementById('midiIn');
  parts.push('Web MIDI available: ' + (navigator.requestMIDIAccess ? 'Yes' : 'No'));
  if (midiSel) {
    parts.push('Dispositivo seleccionado: ' + (midiSel.value ? midiSel.options[midiSel.selectedIndex]?.textContent || midiSel.value : '(ninguno)'));
  }

  // Playlist
  parts.push('');
  parts.push('--- PLAYLIST ---');
  parts.push('Elementos: ' + (window.playlist?.length || 0));
  parts.push('Current index: ' + (window.currentPlaylistIndex ?? -1));

  // Active configuration
  parts.push('');
  parts.push('--- CONFIGURATION ---');
  parts.push('Idioma: ' + (CFG?.language || 'es'));
  parts.push('Layout drawer: ' + (CFG?.drawerLayout || 'fullscreen'));
  parts.push('Tema: ' + (CFG?.colorTheme || 'brass'));
  parts.push('Skins: key=' + (CFG?.keySkin || 'classic') + ', tile=' + (CFG?.tileSkin || 'classic'));
  parts.push('Efecto teclas: ' + (CFG?.keyFxStyle || 'flash'));
  parts.push('Teclas visibles: ' + (CFG?.visibleKeyCount || 'auto'));
  parts.push('Ecualizador: preset=' + (CFG?.eq?.preset || 'flat') + ', low=' + (CFG?.eq?.low || 0) + 'dB, mid=' + (CFG?.eq?.mid || 0) + 'dB, high=' + (CFG?.eq?.high || 0) + 'dB');
  parts.push('Metronome: ' + (CFG?.metronome?.enabled ? 'ON (' + CFG.metronome.bpm + ' BPM)' : 'OFF'));
  parts.push('Humanizar: ' + (CFG?.humanize?.enabled ? 'ON' : 'OFF'));
  parts.push('Swing: ' + (CFG?.swing?.amount || 0) + '%');
  parts.push('Realistic audio: ' + (CFG?.realisticAudio?.enabled ? 'ON' : 'OFF'));
  parts.push('Sustain: ' + (CFG?.flags?.sustainHold?.value ? 'ON' : 'OFF'));

  // Flags
  parts.push('');
  parts.push('--- FLAGS ---');
  if (CFG?.flags) {
    Object.entries(CFG.flags).forEach(([k, v]) => {
      parts.push(k + ': ' + (v?.value ? 'ON' : 'OFF'));
    });
  }

  // Control visibility
  parts.push('');
  parts.push('--- CONTROLES VISIBLES ---');
  if (CFG?.controlVisibility) {
    Object.entries(CFG.controlVisibility).forEach(([k, v]) => {
      parts.push(k + ': ' + (v ? 'visible' : 'oculto'));
    });
  }

  return parts.join('\n');
}

function formatTime(s) {
  s = Math.max(0, Math.round(s || 0));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m + ':' + String(sec).padStart(2, '0');
}

// ===== GENERAR REPORTE =====
export function initReportButton() {
  const btn = document.getElementById('btnReporte');
  if (!btn) return;
  btn.addEventListener('click', function() {
    let reporte = '=== REPORTE DE FUNCIONES DE LA APP ===\n';
    reporte += `Generado: ${new Date().toLocaleString()}\n`;
    reporte += `Modo: ${window.appMode || 'free'}\n\n`;

    // Register all functions if they aren't
    registrarTodas();

    // Estado actual
    reporte += '=== ESTADO ACTUAL DE LA APP ===\n';
    reporte += getAppState();
    reporte += '\n\n';

    // Error log of the current session
    reporte += '=== ERROR LOG (current session) ===\n';
    if (!ERROR_LOG.length) {
      reporte += '(no errors registered in this session)\n';
    } else {
      ERROR_LOG.forEach(e => {
        reporte += `[${e.time}] ${e.message}`;
        if (e.detail) reporte += `\n    ${e.detail}`;
        reporte += '\n';
      });
    }
    reporte += '\n';

    // Functions by category
    const categorias = {};
    Object.values(FUNCIONES_REGISTRO).forEach(f => {
      if (!categorias[f.categoria]) categorias[f.categoria] = [];
      categorias[f.categoria].push(f);
    });

    reporte += '=== FUNCTION CATALOG ===\n\n';
    for (const [cat, funcs] of Object.entries(categorias)) {
      reporte += `--- ${cat} (${funcs.length}) ---\n`;
      funcs.forEach(f => {
        const uso = f.usos > 0 ? ` [usada ${f.usos}x]` : '';
        reporte += `  ${f.nombre}: ${f.descripcion}${uso}\n`;
      });
      reporte += '\n';
    }

    const total = Object.keys(FUNCIONES_REGISTRO).length;
    const usadas = Object.values(FUNCIONES_REGISTRO).filter(f => f.usos > 0).length;
    reporte += `=== RESUMEN ===\n`;
    reporte += `Total funciones registradas: ${total}\n`;
    reporte += `Funciones usadas al menos una vez: ${usadas}\n`;
    reporte += `=== FIN DEL REPORTE ===\n`;

    const blob = new Blob([reporte], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `reporte_funciones_${ts}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Reporte generado: ' + total + ' funciones registradas');
  });
}
