// ============================================================
// src/controls/events.js - Eventos globales faltantes
// ============================================================

import { CFG, saveConfig } from '../config.js';
import { resizeCanvases } from '../ui/canvas.js';
import { noteAtPoint } from '../ui/keys.js';
import { handleNoteOn, handleNoteOff } from './keyboard.js';
import { silenceAll, applyMode, resetMouseIdle } from './playback.js';
import { applyDrawerLayout } from '../drawer/layout.js';
import { buildFlagsPanel } from '../drawer/flags.js';
import { pressedKeys } from '../song-state.js';
import { isFullscreen } from './transport.js';

// ===== CLIC EN TECLADO VIRTUAL =====
// Nota que se empezó a sonar con el mouse. Se guarda para soltar SIEMPRE la
// misma, aunque el cursor se mueva entre mousedown y mouseup (o el botón se
// suelte fuera del canvas). Antes la nota se recalculaba en el mouseup: si el
// cursor se había movido, soltaba otra distinta y la original quedaba pegada.
let mouseNote = null;

function pointerNoteHandler(isDown) {
  return (e) => {
    if (!CFG.flags.virtualKeyboardClicks.value) return;
    const canvas = document.getElementById('keysCanvas');
    if (!canvas) return;
    if (isDown) {
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const note = noteAtPoint(px, py);
      if (note == null) return;
      const pressed = pressedKeys || new Set();
      if (!pressed.has(note)) {
        handleNoteOn(note, 100);
        mouseNote = note;
      }
    } else if (mouseNote != null) {
      handleNoteOff(mouseNote);
      mouseNote = null;
    }
  };
}

// ===== TOUCH (MULTITOUCH) EN TECLADO VIRTUAL =====
// Mapa touch.identifier -> nota, para soportar varios dedos a la vez
// y permitir "arrastrar" el dedo entre teclas (glissando) sin soltar.
const activeTouchNotes = new Map();

function touchToNote(canvas, touch) {
  const rect = canvas.getBoundingClientRect();
  const px = touch.clientX - rect.left;
  const py = touch.clientY - rect.top;
  return noteAtPoint(px, py);
}

function initTouchEvents(keysCanvas) {
  const onTouchStart = e => {
    if (!CFG.flags.touchMode.value) return;
    e.preventDefault();
    resetMouseIdle();
    // for-loop en vez de Array.from(...).forEach: touchstart/move dispara muy
    // seguido con varios dedos, evitamos crear un array nuevo cada vez.
    const touches = e.changedTouches;
    for (let i = 0; i < touches.length; i++) {
      const touch = touches[i];
      const note = touchToNote(keysCanvas, touch);
      if (note == null) continue;
      activeTouchNotes.set(touch.identifier, note);
      const pressed = pressedKeys || new Set();
      if (!pressed.has(note)) handleNoteOn(note, 100);
    }
  };

  const onTouchMove = e => {
    if (!CFG.flags.touchMode.value) return;
    e.preventDefault();
    const touches = e.changedTouches;
    for (let i = 0; i < touches.length; i++) {
      const touch = touches[i];
      const prevNote = activeTouchNotes.get(touch.identifier);
      const note = touchToNote(keysCanvas, touch);
      if (note === prevNote) continue;
      if (prevNote != null) handleNoteOff(prevNote);
      if (note != null) {
        activeTouchNotes.set(touch.identifier, note);
        const pressed = pressedKeys || new Set();
        if (!pressed.has(note)) handleNoteOn(note, 100);
      } else {
        activeTouchNotes.delete(touch.identifier);
      }
    }
  };

  const onTouchEnd = e => {
    if (!CFG.flags.touchMode.value) return;
    e.preventDefault();
    const touches = e.changedTouches;
    for (let i = 0; i < touches.length; i++) {
      const touch = touches[i];
      const note = activeTouchNotes.get(touch.identifier);
      if (note != null) handleNoteOff(note);
      activeTouchNotes.delete(touch.identifier);
    }
  };

  keysCanvas.addEventListener('touchstart', onTouchStart, { passive: false });
  keysCanvas.addEventListener('touchmove', onTouchMove, { passive: false });
  keysCanvas.addEventListener('touchend', onTouchEnd, { passive: false });
  keysCanvas.addEventListener('touchcancel', onTouchEnd, { passive: false });

  // If the device confirms touch support, we enable the flag by default
  // the first time a real touch is detected (auto-detection).
  keysCanvas.addEventListener('touchstart', function autoEnable() {
    if (!CFG.flags.touchMode.value) {
      CFG.flags.touchMode.value = true;
      buildFlagsPanel();
      saveConfig();
    }
    document.body.classList.add('touch-device');
    keysCanvas.removeEventListener('touchstart', autoEnable);
  }, { passive: true });
}

// ===== INICIALIZAR EVENTOS GLOBALES =====
export function initGlobalEvents() {
  // 1. Clic en teclado virtual
  const keysCanvas = document.getElementById('keysCanvas');
  if (keysCanvas) {
    keysCanvas.addEventListener('mousedown', pointerNoteHandler(true));
    // mouseup a nivel WINDOW: si el usuario suelta el botón fuera del canvas,
    // la nota se suelta igual (antes quedaba pegada hasta el mouseleave).
    window.addEventListener('mouseup', pointerNoteHandler(false));
    // Sólo soltamos la nota del MOUSE; las del teclado físico se gestionan con
    // sus propios keyup y no deben cortarse por salir del canvas.
    keysCanvas.addEventListener('mouseleave', () => {
      if (mouseNote != null) {
        handleNoteOff(mouseNote);
        mouseNote = null;
      }
    });
    initTouchEvents(keysCanvas);
  }

  // (The drawer's category toggle is already handled in drawer.js -> initDrawerEvents,
  // removed from here because it was duplicated and the two toggles canceled each other out)

  // 3. Botones de modo (Libre/Ver/Practicar)
  document.querySelectorAll('[data-mode-btn]').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.modeBtn;
      applyMode(mode);   // applyMode publica también window.appMode
    });
  });

  // 4. Mouse idle (auto-hide cursor)
  window.addEventListener('mousemove', resetMouseIdle);
  window.addEventListener('mousedown', resetMouseIdle);
  window.addEventListener('keydown', resetMouseIdle);

  // 5. Visibility change - mute when switching tab
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) silenceAll();
  });

  // 6. Fullscreen change - update button
  ['fullscreenchange', 'webkitfullscreenchange', 'MSFullscreenChange'].forEach(evt => {
    document.addEventListener(evt, () => {
      const btn = document.getElementById('btnFullscreen');
      if (btn) btn.textContent = isFullscreen() ? '⤢' : '⛶';
    });
  });

  // 7. Resize - redimensionar canvas
  window.addEventListener('resize', resizeCanvases);

  // 8. Aplicar layout del drawer al inicio
  applyDrawerLayout();
}