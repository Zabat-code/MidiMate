// ============================================================
// src/controls/playback.js - Playback and state
// ============================================================

import { CFG, saveConfig } from '../config.js';
import { t } from '../i18.js';
import { actx, masterGain, activeVoices, autoVoices, releaseVoice, playMetronomeClick } from '../audio.js';
import { drawKeys } from '../ui/keys.js';
import { drawRoll } from '../ui/roll.js';
import { drawStaff } from '../ui/staff.js';
import { resizeCanvases } from '../ui/canvas.js';
import { CHROMA_COLORS, currentTheme, applyModeFilter } from './drawer.js';

// ===== ESTADO =====
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

export let accuracy = { hits: 0, total: 0 };
export let appMode = 'free';
export let freeNotes = [];
export let trackSettings = {};
export let prevCursorTime = 0;
export function setPrevCursorTime(v) { prevCursorTime = v; }
export let keyEffects = [];

// ===== REFERENCIAS A ESTADO GLOBAL (inyectado) =====
export let pressedKeys = new Set();
export let autoPressedNotes = new Set();
export let hitFeedback = new Map();
export let sustainedNotes = new Set();
export let keyboardPedalDown = false;
export let midiPedalDown = false;

export function setKeyboardPedalDown(value) {
  keyboardPedalDown = value;
}

export function setMidiPedalDown(value) {
  midiPedalDown = value;
}

export function setPlaybackState(pressed, auto, hit, sustained, keyboardPedal, midiPedal) {
  pressedKeys = pressed;
  autoPressedNotes = auto;
  hitFeedback = hit;
  sustainedNotes = sustained;
  keyboardPedalDown = keyboardPedal;
  midiPedalDown = midiPedal;
}

// ===== FUNCIONES EXPORTADAS =====
export function applyMode(mode) {
  appMode = mode;
  document.querySelectorAll('[data-mode-btn]').forEach(b => {
    b.classList.toggle('active-mode', b.dataset.modeBtn === mode);
  });
  document.body.classList.toggle('mode-free', mode === 'free');
  if (mode === 'free') {
    song.playing = false;
    song.countIn = null;
    updatePlayButtonLabel();
  }
  if ((mode === 'watch' || mode === 'practice') && !song.notes.length) {
    const btn = document.getElementById('btnLoad');
    btn?.classList.add('attention-blink');
    setTimeout(() => btn?.classList.remove('attention-blink'), 2000);
  }
  window.applyFlags?.();
  applyModeFilter(mode);
}

export function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => el.classList.remove('show'), CFG.toastDuration * 1000);
}

// ===== PLAY/PAUSE =====
export function togglePlay() {
  window.usarFuncion?.('togglePlay');
  if (actx.state === 'suspended') actx.resume();

  if (song.playing) {
    song.playing = false;
    song.countIn = null;
    silenceAll();
    updatePlayButtonLabel();
    document.getElementById('countInOverlay')?.classList.add('hidden');
    document.getElementById('centerAnnounce')?.classList.remove('show');
    return;
  }

  console.log('[DEBUG] togglePlay', { mode: appMode, notes: song.notes.length, duration: song.duration, announce: CFG.announce.enabled, countIn: CFG.countIn.enabled });

  // En modo Libre, al dar Play pasamos automáticamente a Ver para que la
  // canción se reproduzca sola (en Libre las notas no suenan por sí mismas).
  if (appMode === 'free') applyMode('watch');

  if (appMode !== 'free' && song.notes.length && (CFG.announce.enabled || CFG.countIn.enabled)) {
    const announceOn = CFG.announce.enabled;
    const countInOn = CFG.countIn.enabled;
    const announceDur = Math.max(0, CFG.toastDuration);
    const countInDur = 4;
    let totalWait, countdownStart;
    if (announceOn && countInOn) {
      totalWait = Math.max(announceDur, countInDur);
      countdownStart = Math.max(0, announceDur - countInDur);
    } else if (announceOn) {
      totalWait = announceDur;
      countdownStart = null;
    } else {
      totalWait = countInDur;
      countdownStart = 0;
    }
    if (totalWait <= 0) {
      song.playing = true;
      switchToAutoKeyRange();
      song.lastFrameTs = null;
      window.metroNextTime = null;
      updatePlayButtonLabel();
      resetMouseIdle();
      console.log('[DEBUG] reproduce sin espera');
      return;
    }
    song.countIn = {
      startedAt: performance.now(),
      totalWait: totalWait * 1000,
      countdownStart: countdownStart == null ? null : countdownStart * 1000,
      announceOn,
      countInOn,
      lastTick: -1
    };
    if (announceOn) {
      const el = prepareAnnounce(song.fileName || '');
      el?.classList.remove('hidden');
      requestAnimationFrame(() => el?.classList.add('show'));
    }
    updatePlayButtonLabel();
    resetMouseIdle();
    return;
  }

  song.playing = true;
  switchToAutoKeyRange();
  song.lastFrameTs = null;
  window.metroNextTime = null;
  updatePlayButtonLabel();
  resetMouseIdle();
  console.log('[DEBUG] reproduce directo');
}

// Al reproducir un MIDI, pasamos el rango de teclas a "Automático (según el
// MIDI)" para que se ajuste al rango real de notas de la canción. Solo si el
// usuario no lo había fijado manualmente en otra cosa distinta de automático.
function switchToAutoKeyRange() {
  try {
    if (CFG.visibleKeyCount !== 'opt5' && CFG.visibleKeyCount !== 'auto') {
      CFG.visibleKeyCount = 'opt5';
      saveConfig();
      window.applyKeyboardRange && window.applyKeyboardRange();
    }
  } catch (e) { console.warn('switchToAutoKeyRange:', e); }
}

export function stopPlayback() {
  song.playing = false;
  song.countIn = null;
  song.cursorTime = 0;
  song.pendingGate = null;
  document.getElementById('countInOverlay')?.classList.add('hidden');
  silenceAll();
  updatePlayButtonLabel();
  // Restaura los presets originales de la canción tras el override temporal
  // "aplicar instrumento a todas las pistas", a menos que el toggle
  // "mantener" esté activo (en ese caso el override persiste).
  if (song.__origPresets && !window.__keepAllPreset) {
    for (const k in song.__origPresets) {
      if (!window.trackSettings[k]) window.trackSettings[k] = {};
      window.trackSettings[k].preset = song.__origPresets[k];
    }
    song.__origPresets = null;
    song.__tempPreset = null;
  }
}

export function seekBy(deltaSeconds) {
  song.cursorTime = Math.max(0, Math.min(song.duration, song.cursorTime + deltaSeconds));
  song.pendingGate = null;
  resyncAutoPlayback();
}

// ===== SILENCIAR =====
export function silenceAll() {
  activeVoices.forEach((v, k) => releaseVoice(activeVoices, k));
  autoVoices.forEach((v, k) => releaseVoice(autoVoices, k));
  pressedKeys.clear();
  sustainedNotes.clear();
  autoPressedNotes.clear();
  prevCursorTime = song.cursorTime;
  if (window._autoEndTimes) window._autoEndTimes.clear();
}

export function resyncAutoPlayback() {
  prevCursorTime = song.cursorTime;
  autoVoices.forEach((v, k) => releaseVoice(autoVoices, k));
  if (window._autoEndTimes) window._autoEndTimes.clear();
}

// ===== UPDATE UI =====
export function updatePlayButtonLabel() {
  const btn = document.getElementById('btnPlay');
  if (!btn) return;
  if (song.countIn) btn.textContent = '…';
  else btn.textContent = song.playing ? '⏸' : '▶';
}

export function updateAccuracyBadge() {
  const pct = accuracy.total ? Math.round(100 * accuracy.hits / accuracy.total) : 100;
  document.getElementById('accBadge').textContent = `${t('accuracyLabel')}: ${pct}%`;
}

export function updateLoopButton() {
  document.getElementById('btnLoop')?.classList.toggle('active-toggle', CFG.flags.loopSong.value);
}

// ===== VOLUMEN =====
let volumeBeforeMute = 0.8;

export function toggleMute() {
  if (CFG.volume > 0) {
    volumeBeforeMute = CFG.volume;
    setVolume(0);
    showToast(t('mutedToast'));
  } else {
    setVolume(Math.round((volumeBeforeMute || 0.8) * 100));
    showToast(t('unmutedToast'));
  }
}

export function setVolume(pct) {
  pct = Math.max(0, Math.min(300, pct));
  CFG.volume = pct / 100;
  masterGain.gain.value = CFG.volume;
  document.getElementById('volume').value = pct;
  document.getElementById('volumeNum').value = pct;
  updateVolIcon();
  saveConfig();
  if (pct > 250) showToast(t('volumeWarning'));
}

export function updateVolIcon() {
  const icon = document.getElementById('volIcon');
  if (!icon) return;
  icon.textContent = CFG.volume === 0 ? '🔇' : (CFG.volume < 0.4 ? '🔉' : '🔊');
}

// ===== MOUSE IDLE =====
let mouseIdleTimer = null;

export function resetMouseIdle() {
  document.body.classList.remove('hide-cursor');
  clearTimeout(mouseIdleTimer);
  if (CFG.flags.autoHideMouse.value && song.playing) {
    mouseIdleTimer = setTimeout(() => document.body.classList.add('hide-cursor'), CFG.mouseHideDelay * 1000);
  }
}

// ===== ANUNCIO =====
const FONT_STACKS = { display: 'var(--font-display)', body: 'var(--font-body)', mono: 'monospace' };

function prepareAnnounce(defaultText) {
  // Si el aviso usa el nombre del archivo (texto vacío en ajustes), quitamos
  // la extensión .mid/.midi para que no se muestre en pantalla.
  let text = CFG.announce.text.trim() || defaultText;
  if (!CFG.announce.text.trim() && /\.(mid|midi)$/i.test(text)) {
    text = text.replace(/\.(mid|midi)$/i, '');
  }
  const el = document.getElementById('centerAnnounce');
  if (!el) return el;
  el.textContent = text;
  el.style.fontFamily = FONT_STACKS[CFG.announce.font] || FONT_STACKS.display;
  el.style.fontSize = CFG.announce.size + 'px';
  el.style.color = CFG.announce.color || '#f2ead9';
  return el;
}

// ===== PROGRESS BAR =====
export function updateProgressBar() {
  const wrap = document.getElementById('progressWrap');
  if (!wrap) return;
  wrap.classList.toggle('hidden', !CFG.flags.showProgressBar.value);
  if (!song.duration) return;
  const pct = Math.min(100, (song.cursorTime / song.duration) * 100);
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressHandle').style.left = pct + '%';
  document.getElementById('timeRemaining').textContent = '-' + formatTime(song.duration - song.cursorTime);
}

function formatTime(s) {
  s = Math.max(0, Math.round(s));
  const m = Math.floor(s / 60),
    sec = s % 60;
  return m + ':' + String(sec).padStart(2, '0');
}

// ===== AUTO-PLAYBACK =====
export function currentGateNotes(tt) {
  const gate = new Set();
  song.notes.forEach(n => {
    if (Math.abs(n.start - tt) < 0.03) gate.add(n.note);
  });
  return gate;
}

let metroNextTime = null;

export function scheduleAutoPlayback() {
  if (!song.playing) { prevCursorTime = song.cursorTime; return; }
  const from = prevCursorTime,
    to = song.cursorTime;
  if (to < from) { prevCursorTime = to; return; }

  const humanizeOpts = CFG.humanize;
  const swingOpts = CFG.swing;
  const trackSettings = window.trackSettings || {};

  song.notes.forEach(n => {
    const cfg = trackSettings[n.track];
    if (cfg && cfg.disabled) return;
    const shouldAuto = appMode === 'watch' ? true : (cfg && cfg.auto);
    if (!shouldAuto) return;

    let tStart = n.start;
    let vel = n.velocity;
    if (humanizeOpts.enabled) {
      const h = getHumanizedTimeAndVel(tStart, vel, humanizeOpts);
      tStart = h.time;
      vel = h.vel;
    }
    if (swingOpts.amount > 0) {
      tStart = applySwing(tStart, swingOpts.amount);
    }

    if (tStart > from && tStart <= to) {
      const preset = (cfg && cfg.preset) || 'piano';
      const key = n.track + '|' + n.note;
      const mixParams = {
        volume: cfg.volume !== undefined ? cfg.volume : 1.0,
        pan: cfg.pan !== undefined ? cfg.pan : 0.0,
        detune: cfg.detune !== undefined ? cfg.detune : 0,
        reverb: cfg.reverb !== undefined ? cfg.reverb : 0.0,
        eq: cfg.eq || { low: 0, mid: 0, high: 0 }
      };
      startAutoVoice(key, preset, n.note, vel, mixParams);
      if (!cfg || cfg.visible !== false) {
        autoPressedNotes.add(n.note);
        let effectColor = currentTheme().played;
        if (CFG.tileSkin === 'chroma') {
          effectColor = CHROMA_COLORS[n.note % 12];
        } else if (CFG.tileSkin === 'tracks') {
          effectColor = cfg.color || '#ffffff';
        }
        spawnKeyEffect(n.note, effectColor, effectColor);
      }
      const duration = n.end - n.start;
      const endTime = tStart + duration;
      window._autoEndTimes.set(key, { end: endTime, note: n.note });
    }

    if (window._autoEndTimes.has(n.track + '|' + n.note)) {
      const entry = window._autoEndTimes.get(n.track + '|' + n.note);
      if (entry && entry.end <= to) {
        stopAutoVoice(n.track + '|' + n.note);
        autoPressedNotes.delete(entry.note);
        window._autoEndTimes.delete(n.track + '|' + n.note);
      }
    }
  });

  prevCursorTime = to;
}

// ===== BUCLE PRINCIPAL =====
export function startPlaybackLoop() {
  window._autoEndTimes = new Map();
  metroNextTime = null;
  requestAnimationFrame(frame);
}

export function frame(ts) {
  try {
    frameInner(ts);
  } catch (err) {
    console.error('frame() error:', err);
  }
  requestAnimationFrame(frame);
}

function frameInner(ts) {
  if (song.lastFrameTs == null) song.lastFrameTs = ts;
  const dt = (ts - song.lastFrameTs) / 1000;
  song.lastFrameTs = ts;

  const countInEl = document.getElementById('countInOverlay');
  const announceEl = document.getElementById('centerAnnounce');

  // Count-in
  if (song.countIn) {
    const ci = song.countIn;
    const elapsed = performance.now() - ci.startedAt;

    // If the config no longer has announce or countIn enabled, force the end
    if (!CFG.announce.enabled && !CFG.countIn.enabled) {
      song.countIn = null;
      song.playing = true;
      song.lastFrameTs = ts;
      metroNextTime = null;
      resyncAutoPlayback();
      updatePlayButtonLabel();
      if (countInEl) countInEl.classList.add('hidden');
      if (announceEl) {
        announceEl.classList.remove('show');
        setTimeout(() => announceEl.classList.add('hidden'), 400);
      }
    } else {
      if (ci.announceOn) {
        const announceDur = CFG.toastDuration * 1000;
        if (elapsed >= announceDur && announceEl && announceEl.classList.contains('show')) {
          announceEl.classList.remove('show');
        }
      }

      if (ci.countInOn && ci.countdownStart != null && elapsed >= ci.countdownStart) {
        const remaining = ci.totalWait - elapsed;
        const secondsLeft = Math.ceil(remaining / 1000);
        if (secondsLeft !== ci.lastTick && secondsLeft > 0) {
          ci.lastTick = secondsLeft;
          if (CFG.countIn.audio) playMetronomeClick();
        }
        if (countInEl) {
          countInEl.classList.remove('hidden');
          countInEl.textContent = secondsLeft > 0 ? secondsLeft : '';
        }
      } else {
        if (countInEl) countInEl.classList.add('hidden');
      }

      if (elapsed >= ci.totalWait) {
        song.countIn = null;
        song.playing = true;
        song.lastFrameTs = ts;
        metroNextTime = null;
        resyncAutoPlayback();
        updatePlayButtonLabel();
        console.log('[DEBUG] reproduce tras count-in');
        if (countInEl) countInEl.classList.add('hidden');
        if (announceEl) {
          announceEl.classList.remove('show');
          setTimeout(() => announceEl.classList.add('hidden'), 400);
        }
      }
    }
  } else {
    if (countInEl) countInEl.classList.add('hidden');
  }

  // Song advance
  if (song.playing && !song.countIn) {
    if (appMode === 'practice' && CFG.flags.followMode.value) {
      if (!song.pendingGate) {
        const gate = currentGateNotes(song.cursorTime);
        if (gate.size) song.pendingGate = gate;
      }
      if (!song.pendingGate) song.cursorTime += dt * song.speed;
    } else {
      song.cursorTime += dt * song.speed;
    }
    if (song.cursorTime > song.duration + 1) {
      if (CFG.flags.loopSong.value && window.playlist && window.playlist.length > 0) {
        window.playNextFromPlaylist();
        song.cursorTime = 0;
        song.pendingGate = null;
        resyncAutoPlayback();
        if (!song.playing) {
          showToast(`Siguiente: ${window.playlist[window.currentPlaylistIndex]?.name || ''}`);
        }
      } else if (CFG.flags.loopSong.value) {
        song.cursorTime = 0;
        song.pendingGate = null;
        resyncAutoPlayback();
      } else {
        song.playing = false;
        updatePlayButtonLabel();
        // Automatically play the next song in the playlist if it exists
        if (window.playlist && window.playlist.length > 0 && window.currentPlaylistIndex >= 0 && window.currentPlaylistIndex < window.playlist.length - 1) {
          window.playNextFromPlaylist();
        }
      }
    }
  }

  scheduleAutoPlayback();

  // Metronome
  if (CFG.metronome.enabled && song.playing && !song.countIn) {
    if (metroNextTime == null) metroNextTime = actx.currentTime;
    const interval = 60 / CFG.metronome.bpm;
    let guard = 0;
    while (actx.currentTime >= metroNextTime && guard < 8) {
      playMetronomeClick();
      metroNextTime += interval;
      guard++;
    }
  } else if (!song.countIn) {
    metroNextTime = null;
  }

  updateProgressBar();
  if (!song.playing) document.body.classList.remove('hide-cursor');

  drawKeys();
  drawRoll();
  drawStaff();
  updateChordBadge();
}

// ===== NOMBRE DE ACORDE (overlay sobre el roll) =====
// The element is cached once (avoids a DOM lookup on every
// frame, ~60 veces por segundo) y solo se toca el DOM si el texto o la
// visibilidad realmente cambiaron, para no forzar reflow innecesario.
let _chordBadgeEl = null;
let _lastChordText = null;
function updateChordBadge() {
  if (!CFG.flags.showChordNames.value) {
    if (_lastChordText !== null) {
      if (!_chordBadgeEl) _chordBadgeEl = document.getElementById('chordBadge');
      if (_chordBadgeEl) _chordBadgeEl.style.display = 'none';
      _lastChordText = null;
    }
    return;
  }
  if (!_chordBadgeEl) _chordBadgeEl = document.getElementById('chordBadge');
  if (!_chordBadgeEl) return;
  // Solo mostrar nombres de acorde en modo Libre y Practicar (no en Ver)
  if (appMode === 'watch') {
    if (_lastChordText !== null) {
      _chordBadgeEl.style.display = 'none';
      _lastChordText = null;
    }
    return;
  }
  if (!pressedKeys.size && !autoPressedNotes.size) {
    if (_lastChordText !== null) {
      _chordBadgeEl.style.display = 'none';
      _lastChordText = null;
    }
    return;
  }
  const sounding = new Set([...pressedKeys, ...autoPressedNotes]);
  const name = window.chordName ? window.chordName(sounding) : '';
  if (name === _lastChordText) return;
  _lastChordText = name;
  if (!name) {
    _chordBadgeEl.style.display = 'none';
    return;
  }
  _chordBadgeEl.textContent = name;
  _chordBadgeEl.style.display = 'block';
}

// ===== HUMANIZATION FUNCTIONS =====
function getHumanizedTimeAndVel(time, vel, opts) {
  if (!opts.enabled) return { time, vel: Math.round(vel) };
  const seed1 = Math.sin(time * 12345.678) * 10000;
  const seed2 = Math.sin(time * 54321.987) * 10000;
  const jitterMs = (seed1 - Math.floor(seed1)) * 2 - 1;
  const jitterSec = jitterMs * (opts.jitterTime / 1000);
  const velJitter = (seed2 - Math.floor(seed2)) * 2 - 1;
  const velFactor = 1 + velJitter * (opts.jitterVel / 100);
  return {
    time: time + jitterSec,
    vel: Math.min(127, Math.max(1, Math.round(vel * velFactor)))
  };
}

function applySwing(time, swingAmount) {
  if (swingAmount === 0) return time;
  const beatDur = 60 / (song.bpm || 120);
  const pos = time % beatDur;
  if (pos > beatDur * 0.25 && pos < beatDur * 0.75) {
    const delay = (swingAmount / 100) * 0.035;
    return time + delay;
  }
  return time;
}

// ===== REFERENCIAS A UI Y AUDIO =====
function startAutoVoice(key, preset, note, velocity, mixParams) {
  if (window.startAutoVoice) window.startAutoVoice(key, preset, note, velocity, mixParams);
}
function stopAutoVoice(key) {
  if (window.stopAutoVoice) window.stopAutoVoice(key);
}
function spawnKeyEffect(note, rgb, chromaColor) {
  if (window.spawnKeyEffect) window.spawnKeyEffect(note, rgb, chromaColor);
}