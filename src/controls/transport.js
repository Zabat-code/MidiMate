// ============================================================
// src/controls/transport.js - Eventos de transporte (botones)
// ============================================================

import { CFG, saveConfig } from '../config.js';
import { actx } from '../audio.js';
import { song, togglePlay, stopPlayback, seekBy, silenceAll, updatePlayButtonLabel, updateLoopButton, setVolume, updateVolIcon, showToast, resyncAutoPlayback } from './playback.js';
import { resizeCanvases } from '../ui/canvas.js';

// ===== PANTALLA COMPLETA =====
export function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
}

export function enterFullscreen() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
  if (req) req.call(el);
}

export function exitFullscreenSafe() {
  const exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
  if (exit) exit.call(document);
}

// ===== TEMPO =====
export function setTempoValue(v) {
  v = Math.max(25, Math.min(300, Math.round(+v) || 100));
  CFG.tempo = v / 100;
  song.speed = CFG.tempo;
  document.getElementById('tempo').value = v;
  document.getElementById('tempoNum').value = v;
  saveConfig();
}

// ===== PROGRESS BAR =====
export function seekFromEvent(e) {
  const wrap = document.getElementById('progressWrap');
  if (!wrap || !song.duration) return;
  const rect = wrap.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  song.cursorTime = ratio * song.duration;
  song.pendingGate = null;
  resyncAutoPlayback();
}

// ===== STAFF RESIZE =====
const STAFF_MIN_HEIGHT = 90;

export function staffMaxHeight() {
  return window.innerHeight - 260;
}

export function setStaffHeight(px) {
  const max = staffMaxHeight();
  px = Math.max(STAFF_MIN_HEIGHT, Math.min(max, px));
  CFG.staffHeight = px;
  const wrap = document.getElementById('staffWrap');
  if (wrap) wrap.style.height = px + 'px';
  saveConfig();
  resizeCanvases();
}

// ===== INICIALIZAR EVENTOS =====
export function initTransportEvents() {
  // Play/Pause
  document.getElementById('btnPlay')?.addEventListener('click', () => {
    if (actx.state === 'suspended') actx.resume();
    // Si hay canciones en la lista de reproducción y ninguna está cargada
    // como activa, reproducir la lista (no la canción suelta).
    if (window.playlist && window.playlist.length > 0 &&
        (window.currentPlaylistIndex == null || window.currentPlaylistIndex < 0)) {
      if (window.loadPlaylistAt) { window.loadPlaylistAt(0, true); return; }
    }
    togglePlay();
  });

  // Stop
  document.getElementById('btnStop')?.addEventListener('click', () => {
    stopPlayback();
  });

  // Rewind / Forward
  document.getElementById('btnRewind')?.addEventListener('click', () => seekBy(-5));
  document.getElementById('btnForward')?.addEventListener('click', () => seekBy(5));

  // Loop
  document.getElementById('btnLoop')?.addEventListener('click', () => {
    CFG.flags.loopSong.value = !CFG.flags.loopSong.value;
    updateLoopButton();
    saveConfig();
  });

  // Fullscreen
  document.getElementById('btnFullscreen')?.addEventListener('click', () => {
    if (!isFullscreen()) enterFullscreen();
    else exitFullscreenSafe();
  });

  // Tempo
  document.getElementById('tempo')?.addEventListener('input', e => setTempoValue(e.target.value));
  document.getElementById('tempoNum')?.addEventListener('input', e => setTempoValue(e.target.value));
  document.getElementById('tempoNum')?.addEventListener('change', e => setTempoValue(e.target.value));

  // Volume
  document.getElementById('volume')?.addEventListener('input', e => setVolume(+e.target.value));
  document.getElementById('volumeNum')?.addEventListener('change', e => setVolume(+e.target.value));

  // Progress bar - click y arrastre
  const progressWrap = document.getElementById('progressWrap');
  if (progressWrap) {
    let draggingProgress = false;
    progressWrap.addEventListener('mousedown', e => {
      draggingProgress = true;
      seekFromEvent(e);
    });
    window.addEventListener('mousemove', e => {
      if (draggingProgress) seekFromEvent(e);
    });
    window.addEventListener('mouseup', () => {
      draggingProgress = false;
    });
  }

  // Staff resize handle
  const handle = document.getElementById('staffResizeHandle');
  const wrap = document.getElementById('staffWrap');
  if (handle && wrap) {
    let dragging = false;
    let startY = 0;
    let startH = 0;
    handle.addEventListener('mousedown', e => {
      dragging = true;
      startY = e.clientY;
      startH = wrap.offsetHeight;
      e.preventDefault();
    });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      setStaffHeight(startH + (e.clientY - startY));
    });
    window.addEventListener('mouseup', () => {
      dragging = false;
    });
  }

  // Inicializar tempo desde config
  if (CFG.tempo) {
    setTempoValue(Math.round(CFG.tempo * 100));
  } else {
    setTempoValue(100);
  }
}