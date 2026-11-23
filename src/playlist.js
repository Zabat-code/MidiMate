// ============================================================
// src/playlist.js - Playlist
// ============================================================

import { CFG, saveConfig } from './config.js';
import { t } from './i18.js';
import { parseMidi, midiToNotes } from './midi.js';
import { actx, analyzeAndOptimizeMidi } from './audio.js';
import {
  setPrevCursorTime, applyMode, song, trackSettings, showToast, silenceAll,
  updatePlayButtonLabel, updateAccuracyBadge, setMidiTracks
} from './controls/playback.js';
import { programToPresetName, extractProgramsFromTrack, buildTracksPanel } from './controls/tracks.js';
import { playlist, currentPlaylistIndex, setCurrentPlaylistIndex, setPlaylistAdvanceHandler } from './playlist-store.js';

// El estado vive en playlist-store.js. Se reexporta aquí porque main.js y
// otros consumidores lo importarían aquí, y cambiar eso todo de golpe no aporta
// nada mientras el store siga siendo la única fuente.
export { playlist, currentPlaylistIndex, setCurrentPlaylistIndex } from './playlist-store.js';

export function syncPlaylistFromConfig() {
  if (CFG && Array.isArray(CFG.playlist)) {
    playlist.splice(0, playlist.length, ...CFG.playlist);
  } else {
    playlist.splice(0, playlist.length);
  }
}

function stripExt(name = '') {
  return name.replace(/\.[^.]+$/, '');
}

function updatePlaylistBadge() {
  const el = document.getElementById('logoLabel');
  if (!el) return;
  const activeName = song?.fileName || '';
  if (playlist.length > 1 && currentPlaylistIndex >= 0) {
    el.textContent = `${stripExt(activeName)} [${currentPlaylistIndex + 1}/${playlist.length}]`;
  } else {
    el.textContent = stripExt(activeName);
  }
}

function refreshPlaylistButtons() {
  const prev = document.getElementById('btnPlaylistPrev');
  const next = document.getElementById('btnPlaylistNext');
  if (prev) prev.disabled = !(playlist.length > 1);
  if (next) next.disabled = !(playlist.length > 1);
}

function selectPlaylistItem(index) {
  if (index < 0 || index >= playlist.length) return;
  setCurrentPlaylistIndex(index);
  renderPlaylist();
  loadPlaylistAt(index, false);
}

export function loadSongData(notes, duration, fileName, bpm, existingColors = {}) {
  // `song` es el objeto de playback.js (importado arriba), mutable in-place:
  // se le pueden asignar las propiedades sin tocar la referencia.
  if (!song) return;
  // Mute any active audio before loading a new song
  silenceAll?.();
  song.notes = notes || [];
  song.duration = duration || 0;
  song.fileName = fileName || null;
  song.bpm = bpm || 120;
  song.cursorTime = 0;
  song.pendingGate = null;
  song.lastFrameTs = null;
  song.countIn = null;
  song.playing = false;
  setPrevCursorTime(0);
  if (trackSettings && typeof existingColors === 'object') {
    Object.entries(existingColors).forEach(([idx, color]) => {
      if (!trackSettings[idx]) trackSettings[idx] = {};
      trackSettings[idx].color = color;
    });
  }
  // Habilitar botones de transporte
  const playBtn = document.getElementById('btnPlay');
  const rewindBtn = document.getElementById('btnRewind');
  const stopBtn = document.getElementById('btnStop');
  const forwardBtn = document.getElementById('btnForward');
  if (playBtn) playBtn.disabled = false;
  if (rewindBtn) rewindBtn.disabled = false;
  if (stopBtn) stopBtn.disabled = false;
  if (forwardBtn) forwardBtn.disabled = false;
  // Adjust keyboard range according to the MIDI notes
  if (song.notes.length && window.applyKeyboardRange) {
    window.applyKeyboardRange();
  }
  updatePlayButtonLabel?.();
  updateAccuracyBadge?.();
  buildTracksPanel?.();
  updatePlaylistBadge();
  refreshPlaylistButtons();
  // Analyze and auto-optimize sound when loading each song
  setTimeout(() => {
    analyzeAndOptimizeMidi?.();
  }, 50);
}

export function loadPlaylistAt(idx, autoPlay = false) {
  if (!playlist.length) return;
  setCurrentPlaylistIndex(((idx % playlist.length) + playlist.length) % playlist.length);
  renderPlaylist();
  const entry = playlist[currentPlaylistIndex];
  if (!entry?.dataUrl) return;
  fetch(entry.dataUrl)
    .then(r => r.arrayBuffer())
    .then(buf => {
      try {
        const parsed = parseMidi(buf);
        const notes = midiToNotes(parsed);
        const duration = Math.max(...notes.map(n => n.end), 0);
        let initialTempo = 500000;
        outer: for (const trk of parsed.tracks) {
          for (const ev of trk) {
            if (ev.tempo !== undefined) {
              initialTempo = ev.tempo;
              break outer;
            }
          }
        }
        const bpm = 60000000 / initialTempo;
        // Detectar instrumentos de cada pista del MIDI
        if (trackSettings && extractProgramsFromTrack && programToPresetName) {
          parsed.tracks.forEach((events, trackIdx) => {
            const progs = extractProgramsFromTrack(events);
            if (progs.length) {
              const lastProg = progs[progs.length - 1].prog;
              if (!trackSettings[trackIdx]) trackSettings[trackIdx] = {};
              if (!trackSettings[trackIdx].preset) {
                trackSettings[trackIdx].preset = programToPresetName(lastProg);
              }
            }
          });
        }
        // Guardar TODAS las pistas del MIDI (con y sin notas) para que el
        // panel de pistas pueda mencionarlas aunque alguna no tenga notas
        // (p.ej. la pista 1 de metadatos).
        setMidiTracks(parsed.tracks);
        const existingColors = {};
        if (trackSettings) {
          Object.keys(trackSettings).forEach(idx => {
            if (trackSettings[idx]?.color) existingColors[idx] = trackSettings[idx].color;
          });
        }
        loadSongData(notes, duration, entry.name, bpm, existingColors);
        renderPlaylist();
        if (autoPlay) {
          document.getElementById('btnPlay')?.click();
        } else {
          showToast(`${currentPlaylistIndex + 1}/${playlist.length} · ${entry.name}`);
          // No mostrar el modal de modo al navegar la lista: mantener el modo actual
        }
      } catch (e) {
        showToast('Error al cargar siguiente: ' + e.message);
      }
    })
    .catch(e => {
      showToast('Error al cargar archivo: ' + e.message);
    });
}

function movePlaylistItem(from, to) {
  if (from < 0 || to < 0 || from >= playlist.length || to >= playlist.length) return;
  const [item] = playlist.splice(from, 1);
  playlist.splice(to, 0, item);
  if (currentPlaylistIndex === from) setCurrentPlaylistIndex(to);
  else if (from < currentPlaylistIndex && to >= currentPlaylistIndex) setCurrentPlaylistIndex(currentPlaylistIndex - 1);
  else if (from > currentPlaylistIndex && to <= currentPlaylistIndex) setCurrentPlaylistIndex(currentPlaylistIndex + 1);
  saveConfig();
  renderPlaylist();
}

export function renderPlaylist() {
  // The container may exist in both the General and Playlist categories
  const containers = document.querySelectorAll('#playlistContainer');
  containers.forEach(container => {
    container.innerHTML = '';
    if (!playlist.length) {
      container.innerHTML = '<div style="font-size:11px; color:var(--ivory-dim);">' + t('playlistEmpty') + '</div>';
      return;
    }
    playlist.forEach((item, index) => {
      const div = document.createElement('div');
      div.className = `playlist-item${index === currentPlaylistIndex ? ' active' : ''}`;
      div.dataset.index = String(index);
      div.draggable = true;
      div.innerHTML = `
        <span class="name">${item.name}</span>
        <button class="btn-move" data-move-up="${index}" title="Mover arriba" ${index === 0 ? 'disabled' : ''}>▲</button>
        <button class="btn-move" data-move-down="${index}" title="Mover abajo" ${index === playlist.length - 1 ? 'disabled' : ''}>▼</button>
        <button class="btn-remove" data-index="${index}">✕</button>
      `;
      div.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        selectPlaylistItem(index);
      });
      // Drag & drop
      div.addEventListener('dragstart', (e) => {
        div.classList.add('dragging');
        e.dataTransfer.setData('text/plain', String(index));
      });
      div.addEventListener('dragend', () => {
        div.classList.remove('dragging');
        containers.forEach(c => c.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over')));
      });
      div.addEventListener('dragover', (e) => {
        e.preventDefault();
        div.classList.add('drag-over');
      });
      div.addEventListener('dragleave', () => {
        div.classList.remove('drag-over');
      });
      div.addEventListener('drop', (e) => {
        e.preventDefault();
        div.classList.remove('drag-over');
        const from = parseInt(e.dataTransfer.getData('text/plain'));
        if (!isNaN(from) && from !== index) {
          movePlaylistItem(from, index);
        }
      });
      container.appendChild(div);
    });

    // Botones de reordenar (▲/▼)
    container.querySelectorAll('[data-move-up]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.moveUp);
        movePlaylistItem(idx, idx - 1);
      });
    });
    container.querySelectorAll('[data-move-down]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.moveDown);
        movePlaylistItem(idx, idx + 1);
      });
    });

    // Botones de eliminar (✕)
    container.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const idx = parseInt(this.dataset.index);
        playlist.splice(idx, 1);
        if (currentPlaylistIndex >= idx) {
          setCurrentPlaylistIndex(Math.max(-1, currentPlaylistIndex - 1));
                }
        saveConfig();
        renderPlaylist();
      });
    });
  });
  refreshPlaylistButtons();
  updatePlaylistBadge();
}

export function loadMidiFile(file, addToPlaylist = false) {
  if (!file) return;
  const fileName = file.name;

  if (addToPlaylist) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        playlist.push({ name: fileName, dataUrl: reader.result });
        saveConfig();
        renderPlaylist();
        showToast(`Added: ${fileName}`);
      } catch (err) {
        showToast(t('errorReadingMidi') + err.message);
      }
    };
    reader.readAsDataURL(file);
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = parseMidi(reader.result);
      const notes = midiToNotes(parsed);
      const duration = Math.max(...notes.map(n => n.end), 0);
      let initialTempo = 500000;
      outer: for (const trk of parsed.tracks) {
        for (const ev of trk) {
          if (ev.tempo !== undefined) {
            initialTempo = ev.tempo;
            break outer;
          }
        }
      }
      const bpm = 60000000 / initialTempo;
      // Detectar instrumentos de cada pista del MIDI
      if (trackSettings && extractProgramsFromTrack && programToPresetName) {
        parsed.tracks.forEach((events, trackIdx) => {
          const progs = extractProgramsFromTrack(events);
          if (progs.length) {
            const lastProg = progs[progs.length - 1].prog;
            if (!trackSettings[trackIdx]) trackSettings[trackIdx] = {};
            if (!trackSettings[trackIdx].preset) {
              trackSettings[trackIdx].preset = programToPresetName(lastProg);
            }
          }
        });
      }
      // Guardar TODAS las pistas del MIDI (con y sin notas) para el panel.
      setMidiTracks(parsed.tracks);
      setCurrentPlaylistIndex(-1);
          loadSongData(notes, duration, fileName, bpm);
      updatePlaylistBadge();
      refreshPlaylistButtons();
      document.getElementById('modePromptModal')?.classList.add('open');
    } catch (err) {
      showToast(t('errorReadingMidi') + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

export function playNextFromPlaylist() {
  if (!playlist.length) return;
  loadPlaylistAt(currentPlaylistIndex + 1, !!song?.playing);
}

// playback.js pide "pasa a la siguiente" al terminar la canción (loop de
// canción) sin poder importar este módulo, porque este módulo ya lo importa a
// él. Se registra aquí una vez y el store lo reparte.
setPlaylistAdvanceHandler(playNextFromPlaylist);

// ===== PLAYLIST BUTTON =====
export function initPlaylistButton() {
  const btn = document.getElementById('btnPlaylist');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (window.setDrawerOpen) window.setDrawerOpen(true);
    // Open the drawer and expand the Playlist category directly
    setTimeout(() => {
      if (window.openGroup) window.openGroup('playlist');
      else {
        const group = document.querySelector('.settings-group[data-group="playlist"]');
        if (group) {
          group.classList.add('open');
          group.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }, 300);
  });
}

// ===== EVENTOS =====
// Intención del selector de archivos: 'load' o 'add'. Antes se asignaba sin
// declarar; en un módulo ESM eso es ReferenceError y el handler 'change'
// moría antes de leer el archivo, así que cargar un MIDI no hacia nada.
let playlistIntent = null;

export function initPlaylistEvents() {
  document.getElementById('btnLoad')?.addEventListener('click', () => {
    playlistIntent = 'load';
    document.getElementById('midiFile')?.click();
  });
  document.getElementById('btnAddToPlaylist')?.addEventListener('click', () => {
    playlistIntent = 'add';
    document.getElementById('midiFile')?.click();
  });
  document.getElementById('modePromptPractice')?.addEventListener('click', () => {
    applyMode('practice');
    document.getElementById('modePromptModal')?.classList.remove('open');
  });
  document.getElementById('modePromptWatch')?.addEventListener('click', () => {
    applyMode('watch');
    document.getElementById('modePromptModal')?.classList.remove('open');
  });
  document.getElementById('btnPlaylistPrev')?.addEventListener('click', () => {
    if (!playlist.length) return;
    loadPlaylistAt(currentPlaylistIndex - 1, song?.playing);
    refreshPlaylistButtons();
  });
  document.getElementById('btnPlaylistNext')?.addEventListener('click', () => {
    if (!playlist.length) return;
    loadPlaylistAt(currentPlaylistIndex + 1, song?.playing);
    refreshPlaylistButtons();
  });

  document.getElementById('midiFile')?.addEventListener('change', function(e) {
    const files = e.target.files;
    if (!files.length) return;
    const intent = playlistIntent || 'load';
    playlistIntent = null;

    if (intent === 'add') {
      const wasEmpty = playlist.length === 0;
      if (files.length > 1) {
        for (let i = 0; i < files.length; i++) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            try {
              const dataUrl = ev.target.result;
              playlist.push({ name: files[i].name, dataUrl });
              if (i === files.length - 1) {
                if (wasEmpty) selectPlaylistItem(0);
                saveConfig();
                renderPlaylist();
                showToast(`${files.length} files added to the playlist`);
              }
            } catch (e) {}
          };
          reader.readAsDataURL(files[i]);
        }
      } else {
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            playlist.push({ name: files[0].name, dataUrl: ev.target.result });
            if (wasEmpty) selectPlaylistItem(0);
            saveConfig();
            renderPlaylist();
            showToast(`Added: ${files[0].name}`);
          } catch (e) {}
        };
        reader.readAsDataURL(files[0]);
      }
      return;
    }

    if (files.length > 1) {
      for (let i = 0; i < files.length; i++) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const dataUrl = ev.target.result;
            playlist.push({ name: files[i].name, dataUrl });
            if (i === files.length - 1) {
              saveConfig();
              renderPlaylist();
              showToast(`${files.length} files added to the playlist`);
            }
          } catch (e) {}
        };
        reader.readAsDataURL(files[i]);
      }
      return;
    }
    if (playlist.length > 0) {
      const action = confirm('Add to the playlist? (Cancel to load directly)');
      if (action) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            playlist.push({ name: files[0].name, dataUrl: ev.target.result });
            saveConfig();
            renderPlaylist();
            showToast(`Added: ${files[0].name}`);
          } catch (e) {}
        };
        reader.readAsDataURL(files[0]);
        return;
      }
    }
    loadMidiFile(files[0], false);
  });


  // Drag and drop
  ['dragover', 'dragenter'].forEach(evt => {
    document.addEventListener(evt, e => {
      e.preventDefault();
      document.body.classList.add('drag-over');
    });
  });
  document.addEventListener('dragleave', e => {
    if (e.target === document.documentElement) document.body.classList.remove('drag-over');
  });
  document.addEventListener('drop', e => {
    e.preventDefault();
    document.body.classList.remove('drag-over');
    const files = [...(e.dataTransfer?.files || [])];
    const midiFiles = files.filter(f => /\.(mid|midi)$/i.test(f.name));
    if (!midiFiles.length) {
      showToast(t('dropNotMidi'));
      return;
    }
    if (midiFiles.length > 1) {
      midiFiles.forEach(file => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            playlist.push({ name: file.name, dataUrl: ev.target.result });
          } catch (e) {}
        };
        reader.readAsDataURL(file);
      });
      saveConfig();
      renderPlaylist();
      showToast(`${midiFiles.length} files added to the playlist`);
      return;
    }
    // Cargar directamente sin preguntar
    loadMidiFile(midiFiles[0], false);
  });
}