// ============================================================
// src/controls/keyboard.js - Entrada de teclado PC y Web MIDI
// ============================================================

import { CFG, saveConfig, DEFAULT_KEYMAP } from '../config.js';
import { t } from '../i18.js';
import { song, accuracy, appMode, freeNotes, pressedKeys, autoPressedNotes, hitFeedback, sustainedNotes, keyboardPedalDown, midiPedalDown, silenceAll, updatePlayButtonLabel, updateAccuracyBadge, showToast, setPlaybackState, setKeyboardPedalDown, setMidiPedalDown } from './playback.js';
import { startVoice, stopVoice } from '../audio.js';
import { spawnKeyEffect } from '../ui/roll.js';
import { currentTheme, CHROMA_COLORS } from './drawer.js';

export { pressedKeys, autoPressedNotes, hitFeedback, keyboardPedalDown, midiPedalDown, sustainedNotes } from './playback.js';

// ===== ESTADO =====
export let listeningForNote = null;
export let listeningForShortcut = null;

// ===== FUNCIONES DE MANEJO DE NOTAS =====
export function handleNoteOn(note, velocity) {
  pressedKeys.add(note);
  sustainedNotes.delete(note);
  let effectColor = currentTheme().noteWhite;
  if (CFG.tileSkin === 'chroma') {
    effectColor = CHROMA_COLORS[note % 12];
  } else {
    const layout = window.keyLayout || {};
    if (layout[note]) {
      effectColor = layout[note].black ? currentTheme().noteBlack : currentTheme().noteWhite;
    }
  }
  const mix = { volume: 1, pan: 0, detune: 0, reverb: 0, eq: { low: 0, mid: 0, high: 0 } };
  startVoice(note, velocity, mix);
  window.heldEffectStart?.set(note, performance.now());
  if (appMode === 'practice' && song.notes.length) evaluateHit(note);
  else spawnKeyEffect(note, effectColor, effectColor);
  if (appMode === 'free') {
    freeNotes.push({ note, start: performance.now() / 1000, end: null, track: 0 });
  }
}

export function handleNoteOff(note) {
  pressedKeys.delete(note);
  window.heldEffectStart?.delete(note);
  if (appMode === 'free') {
    for (let i = freeNotes.length - 1; i >= 0; i--) {
      if (freeNotes[i].note === note && freeNotes[i].end == null) {
        freeNotes[i].end = performance.now() / 1000;
        break;
      }
    }
  }
  if (CFG.flags.sustainHold.value && pedalIsDown()) {
    sustainedNotes.add(note);
    return;
  }
  stopVoice(note);
}

export function evaluateHit(note) {
  if (!song.notes.length) return;
  const tt = song.cursorTime;
  const tolerance = 0.25;
  let best = null,
    bestDist = Infinity;
  song.notes.forEach(n => {
    if (n.note !== note) return;
    const d = Math.abs(n.start - tt);
    if (d < tolerance && d < bestDist) { best = n;
      bestDist = d; }
  });
  const isCorrect = !!best;
  accuracy.total++;
  if (isCorrect) accuracy.hits++;
  hitFeedback.set(note, { color: isCorrect ? '#6fbf73' : '#d9534f', until: performance.now() + 250 });
  const effectColor = isCorrect ? '111,191,115' : '217,83,79';
  spawnKeyEffect(note, effectColor, effectColor);
  updateAccuracyBadge();
  if (CFG.flags.followMode.value && song.pendingGate) {
    song.pendingGate.delete(note);
    if (song.pendingGate.size === 0) song.pendingGate = null;
  }
}

// ===== PEDAL =====
export function pedalIsDown() {
  return keyboardPedalDown || midiPedalDown;
}

export function releaseSustainedNotes() {
  sustainedNotes.forEach(n => {
    if (!pressedKeys.has(n)) stopVoice(n);
  });
  sustainedNotes.clear();
}

// ===== KEYMAP =====
export function buildKeymapPanel() {
  const list = document.getElementById('keymapList');
  if (!list) return;
  list.innerHTML = '';
  const reverseMap = {};
  Object.entries(CFG.keymap).forEach(([pk, n]) => { reverseMap[n] = pk; });
  const lo = window.keyboardRange?.lo || 36;
  const hi = window.keyboardRange?.hi || 96;
  for (let note = lo; note <= hi; note++) {
    const physKey = reverseMap[note];
    const row = document.createElement('div');
    row.className = 'keymap-row' + (physKey == null ? ' unmapped' : '');
    row.innerHTML = `<span>${noteName(note)}</span>
      <span class="key-badge" data-note="${note}">${physKey ? physKey.toUpperCase() : '—'}</span>
      <button class="icon-btn" data-remap="${note}" style="font-size:10px;">${t('remap')}</button>`;
    list.appendChild(row);
  }
  list.querySelectorAll('[data-remap]').forEach(btn => {
    btn.addEventListener('click', () => {
      listeningForNote = +btn.dataset.remap;
      const badge = list.querySelector(`.key-badge[data-note="${listeningForNote}"]`);
      if (badge) {
        badge.textContent = '...';
        badge.classList.add('listening');
      }
    });
  });
}

export function resetKeymap() {
  CFG.keymap = { ...DEFAULT_KEYMAP };
  saveConfig();
  buildKeymapPanel();
}

// ===== SHORTCUTS =====
export function buildShortcutsPanel() {
  const list = document.getElementById('shortcutsList');
  if (!list) return;
  list.innerHTML = '';
  const SHORTCUT_KEYS = ['playPause', 'stop', 'seekBack', 'seekFwd', 'loopToggle', 'playlistPrev', 'playlistNext', 'playlistToggle', 'recordToggle', 'mute', 'fullscreen', 'sustainToggle', 'openFile', 'volUp', 'volDown', 'obsClean'];
  const SHORTCUT_LABEL_KEY = {
    playPause: 'shortcutPlayPause',
    mute: 'shortcutMute',
    seekBack: 'shortcutSeekBack',
    seekFwd: 'shortcutSeekFwd',
    fullscreen: 'shortcutFullscreen',
    sustainToggle: 'shortcutSustain',
    openFile: 'shortcutOpenFile',
    volUp: 'shortcutVolUp',
    volDown: 'shortcutVolDown',
    obsClean: 'shortcutObsClean',
    playlistPrev: 'shortcutPlaylistPrev',
    playlistNext: 'shortcutPlaylistNext',
    stop: 'shortcutStop',
    loopToggle: 'shortcutLoopToggle',
    playlistToggle: 'shortcutPlaylistToggle',
    recordToggle: 'shortcutRecordToggle'
  };
  SHORTCUT_KEYS.forEach(key => {
    const row = document.createElement('div');
    row.className = 'keymap-row';
    row.innerHTML = `<span>${t(SHORTCUT_LABEL_KEY[key])}</span>
      <span class="key-badge" data-shortcut="${key}">${keyDisplay(CFG.shortcuts[key])}</span>
      <button class="icon-btn" data-remap-shortcut="${key}">${t('remap')}</button>`;
    list.appendChild(row);
  });
  list.querySelectorAll('[data-remap-shortcut]').forEach(btn => {
    btn.addEventListener('click', () => {
      listeningForShortcut = btn.dataset.remapShortcut;
      const badge = list.querySelector(`.key-badge[data-shortcut="${listeningForShortcut}"]`);
      if (badge) {
        badge.textContent = '...';
        badge.classList.add('listening');
      }
    });
  });
}

function keyDisplay(k) {
  if (k === 'space') return 'Space';
  if (k === 'arrowleft') return '←';
  if (k === 'arrowright') return '→';
  return (k || '').toUpperCase();
}

function noteName(n) {
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return NAMES[n % 12] + (Math.floor(n / 12) - 1);
}

// ===== MANEJO DE TECLAS PC =====
export function initKeyboardEvents() {
  document.getElementById('btnResetKeymap')?.addEventListener('click', resetKeymap);

  window.addEventListener('keydown', e => {
    const isFormField = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName);
    const nk = normalizeKey(e);

    // If the drawer is open, block the piano keys and shortcuts.
    // Only allow navigation: Esc, Tab, Enter, arrow keys.
    // EXCEPTION: if we are listening for a shortcut OR a note (remap mode of
    // atajos o de teclado de PC), NO bloquear, porque la tecla que el usuario
    // the pulse right there is the one to be captured (blocks below). Before this
    // cut off with `return` and only accepted navigation keys, making it impossible to
    // reassign to letters/numbers.
    const drawerOpen = document.getElementById('drawer')?.classList.contains('open');
    if (drawerOpen && !isFormField && !listeningForShortcut && listeningForNote == null) {
      const navKeys = ['Escape', 'Tab', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '];
      if (!navKeys.includes(e.key)) {
        e.preventDefault();
        return;
      }
    }

    if (listeningForShortcut) {
      e.preventDefault();
      CFG.shortcuts[listeningForShortcut] = nk;
      listeningForShortcut = null;
      saveConfig();
      buildShortcutsPanel();
      return;
    }

    if (e.key === 'Shift' && !e.repeat) {
      setKeyboardPedalDown(true);
      return;
    }
    if (e.key === 'Escape') {
      window.setDrawerOpen?.(!document.getElementById('drawer').classList.contains('open'));
      return;
    }
    if (!isFormField) {
      const shortcuts = CFG.shortcuts;
      if (nk === shortcuts.playPause) { e.preventDefault(); document.getElementById('btnPlay')?.click(); return; }
      if (nk === shortcuts.seekBack) { e.preventDefault(); window.seekBy?.(-5); return; }
      if (nk === shortcuts.seekFwd) { e.preventDefault(); window.seekBy?.(5); return; }
      if (nk === shortcuts.mute && !e.ctrlKey && !e.metaKey && !e.altKey) { window.toggleMute?.(); return; }
      if (nk === shortcuts.fullscreen) { document.getElementById('btnFullscreen')?.click(); return; }
      if (nk === shortcuts.sustainToggle) {
        CFG.flags.sustainHold.value = !CFG.flags.sustainHold.value;
        window.buildFlagsPanel?.();
        saveConfig();
        return;
      }
      if (nk === shortcuts.openFile) { document.getElementById('midiFile')?.click(); return; }
      if (nk === shortcuts.volUp) { window.setVolume?.(Math.round(CFG.volume * 100) + 5); return; }
      if (nk === shortcuts.volDown) { window.setVolume?.(Math.round(CFG.volume * 100) - 5); return; }
      if (nk === shortcuts.obsClean) {
        CFG.flags.obsCleanMode.value = !CFG.flags.obsCleanMode.value;
        window.applyFlags?.();
        window.buildFlagsPanel?.();
        saveConfig();
        return;
      }
      if (nk === shortcuts.playlistPrev) {
        document.getElementById('btnPlaylistPrev')?.click();
        return;
      }
      if (nk === shortcuts.playlistNext) {
        document.getElementById('btnPlaylistNext')?.click();
        return;
      }
      if (nk === shortcuts.stop) { document.getElementById('btnStop')?.click(); return; }
      if (nk === shortcuts.loopToggle) { document.getElementById('btnLoop')?.click(); return; }
      if (nk === shortcuts.playlistToggle) { document.getElementById('btnPlaylist')?.click(); return; }
      if (nk === shortcuts.recordToggle) { document.getElementById('btnRecordToggle')?.click(); return; }
    }

    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (listeningForNote != null) {
      Object.keys(CFG.keymap).forEach(pk => {
        if (CFG.keymap[pk] === listeningForNote) delete CFG.keymap[pk];
      });
      CFG.keymap[k] = listeningForNote;
      listeningForNote = null;
      saveConfig();
      buildKeymapPanel();
      return;
    }
    if (CFG.keymap[k] != null && !pressedKeys.has(CFG.keymap[k])) {
      handleNoteOn(CFG.keymap[k], 100);
    }
  });

  // Scroll al elemento enfocado al navegar con Tab (drawer abierto)
  window.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      requestAnimationFrame(() => {
        const el = document.activeElement;
        if (el && el !== document.body && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ block: 'center', inline: 'nearest' });
        }
      });
    }
  });

  window.addEventListener('keyup', e => {
    if (e.key === 'Shift') {
      setKeyboardPedalDown(false);
      if (!pedalIsDown()) releaseSustainedNotes();
      return;
    }
    const k = e.key.toLowerCase();
    if (CFG.keymap[k] != null) {
      handleNoteOff(CFG.keymap[k]);
    }
  });
}

function normalizeKey(e) {
  if (e.code === 'Space') return 'space';
  if (e.key === 'ArrowLeft') return 'arrowleft';
  if (e.key === 'ArrowRight') return 'arrowright';
  return e.key.toLowerCase();
}

// ===== WEB MIDI =====
export function setupWebMidi() {
  if (!navigator.requestMIDIAccess) {
    showToast(t('webMidiUnavailable'));
    return;
  }
  navigator.requestMIDIAccess()
    .then(access => {
      const sel = document.getElementById('midiIn');
      function refreshList() {
        if (!sel) return;
        sel.innerHTML = `<option value="">${t('noMidiDevice')}</option>`;
        for (const input of access.inputs.values()) {
          const opt = document.createElement('option');
          opt.value = input.id;
          opt.textContent = input.name;
          sel.appendChild(opt);
        }
      }
      refreshList();
      access.onstatechange = refreshList;
      let current = null;
      sel?.addEventListener('change', () => {
        if (current) current.onmidimessage = null;
        current = null;
        for (const input of access.inputs.values()) {
          if (input.id === sel.value) current = input;
        }
        if (current) {
          current.onmidimessage = (msg) => {
            const [status, d1, d2] = msg.data;
            const type = status & 0xf0;
            if (type === 0x90 && d2 > 0) handleNoteOn(d1, d2);
            else if (type === 0x80 || (type === 0x90 && d2 === 0)) handleNoteOff(d1);
            else if (type === 0xB0 && d1 === 64) {
              setMidiPedalDown(d2 >= 64);
              if (!pedalIsDown()) releaseSustainedNotes();
            }
          };
        }
      });
    })
    .catch(() => {
      showToast(t('webMidiDenied'));
    });
}