// ============================================================
// src/playlist.js - Playlist
// ============================================================

import { CFG, saveConfig } from './config.js';
import { t } from './i18.js';
import { parseMidi, midiToNotes } from './midi.js';
import { actx } from './audio.js';
import { setPrevCursorTime } from './controls/playback.js';

export let playlist = [];
export let currentPlaylistIndex = -1;

export function syncPlaylistFromConfig() {
  if (CFG && Array.isArray(CFG.playlist)) {
    playlist.splice(0, playlist.length, ...CFG.playlist);
  } else {
    playlist.splice(0, playlist.length);
  }
  if (typeof window !== 'undefined') window.playlist = playlist;
}

function stripExt(name = '') {
  return name.replace(/\.[^.]+$/, '');
}

function updatePlaylistBadge() {
  const el = document.getElementById('logoLabel');
  if (!el) return;
  const activeName = window.song?.fileName || '';
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
  currentPlaylistIndex = index;
  window.currentPlaylistIndex = currentPlaylistIndex;
  renderPlaylist();
  loadPlaylistAt(index, false);
}

export function loadSongData(notes, duration, fileName, bpm, existingColors = {}) {
  const song = window.song;
  if (!song) return;
  // Mute any active audio before loading a new song
  window.silenceAll?.();
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
  if (window.trackSettings && typeof existingColors === 'object') {
    Object.entries(existingColors).forEach(([idx, color]) => {
      if (!window.trackSettings[idx]) window.trackSettings[idx] = {};
      window.trackSettings[idx].color = color;
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
  window.updatePlayButtonLabel?.();
  window.updateAccuracyBadge?.();
  window.buildTracksPanel?.();
  updatePlaylistBadge();
  refreshPlaylistButtons();
  // Analyze and auto-optimize sound when loading each song
  setTimeout(() => {
    window.analyzeAndOptimizeMidi?.();
  }, 50);
}

export function loadPlaylistAt(idx, autoPlay = false) {
  if (!playlist.length) return;
  currentPlaylistIndex = ((idx % playlist.length) + playlist.length) % playlist.length;
  window.currentPlaylistIndex = currentPlaylistIndex;
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
        if (window.trackSettings && window.extractProgramsFromTrack && window.programToPresetName) {
          parsed.tracks.forEach((events, trackIdx) => {
            const progs = window.extractProgramsFromTrack(events);
            if (progs.length) {
              const lastProg = progs[progs.length - 1].prog;
              if (!window.trackSettings[trackIdx]) window.trackSettings[trackIdx] = {};
              if (!window.trackSettings[trackIdx].preset) {
                window.trackSettings[trackIdx].preset = window.programToPresetName(lastProg);
              }
            }
          });
        }
        const existingColors = {};
        if (window.trackSettings) {
          Object.keys(window.trackSettings).forEach(idx => {
            if (window.trackSettings[idx]?.color) existingColors[idx] = window.trackSettings[idx].color;
          });
        }
        loadSongData(notes, duration, entry.name, bpm, existingColors);
        renderPlaylist();
        if (autoPlay) {
          document.getElementById('btnPlay')?.click();
        } else {
          window.showToast(`${currentPlaylistIndex + 1}/${playlist.length} · ${entry.name}`);
          // No mostrar el modal de modo al navegar la lista: mantener el modo actual
        }
      } catch (e) {
        window.showToast('Error al cargar siguiente: ' + e.message);
      }
    })
    .catch(e => {
      window.showToast('Error al cargar archivo: ' + e.message);
    });
}

function movePlaylistItem(from, to) {
  if (from < 0 || to < 0 || from >= playlist.length || to >= playlist.length) return;
  const [item] = playlist.splice(from, 1);
  playlist.splice(to, 0, item);
  if (currentPlaylistIndex === from) currentPlaylistIndex = to;
  else if (from < currentPlaylistIndex && to >= currentPlaylistIndex) currentPlaylistIndex--;
  else if (from > currentPlaylistIndex && to <= currentPlaylistIndex) currentPlaylistIndex++;
  window.currentPlaylistIndex = currentPlaylistIndex;
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
          currentPlaylistIndex = Math.max(-1, currentPlaylistIndex - 1);
          window.currentPlaylistIndex = currentPlaylistIndex;
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
        window.showToast(`Added: ${fileName}`);
      } catch (err) {
        window.showToast(t('errorReadingMidi') + err.message);
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
      if (window.trackSettings && window.extractProgramsFromTrack && window.programToPresetName) {
        parsed.tracks.forEach((events, trackIdx) => {
          const progs = window.extractProgramsFromTrack(events);
          if (progs.length) {
            const lastProg = progs[progs.length - 1].prog;
            if (!window.trackSettings[trackIdx]) window.trackSettings[trackIdx] = {};
            if (!window.trackSettings[trackIdx].preset) {
              window.trackSettings[trackIdx].preset = window.programToPresetName(lastProg);
            }
          }
        });
      }
      currentPlaylistIndex = -1;
      window.currentPlaylistIndex = currentPlaylistIndex;
      if (window.loadSongData) {
        window.loadSongData(notes, duration, fileName, bpm);
      }
      updatePlaylistBadge();
      refreshPlaylistButtons();
      document.getElementById('modePromptModal')?.classList.add('open');
    } catch (err) {
      window.showToast(t('errorReadingMidi') + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

export function playNextFromPlaylist() {
  if (!playlist.length) return;
  window.currentPlaylistIndex = currentPlaylistIndex;
  loadPlaylistAt(currentPlaylistIndex + 1, !!window.song?.playing);
}

if (typeof window !== 'undefined') {
  window.loadSongData = loadSongData;
  window.loadPlaylistAt = loadPlaylistAt;
  window.playNextFromPlaylist = playNextFromPlaylist;
}

// ===== REPORTE =====
export function initReportButton() {
  const btn = document.getElementById('btnReporte');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (window.usarFuncion) window.usarFuncion('initReportButton');
    // Generar reporte de funciones
    let report = 'FUNCTION REPORT - MidiMate\n';
    report += '='.repeat(50) + '\n\n';
    
    const categories = {};
    Object.entries(window._funcionesRegistro || {}).forEach(([key, data]) => {
      if (!categories[data.categoria]) categories[data.categoria] = [];
      categories[data.categoria].push(data);
    });
    
    Object.entries(categories).forEach(([cat, funcs]) => {
      report += `\n${cat}\n${'-'.repeat(50)}\n`;
      funcs.forEach(f => {
        report += `  ${f.nombre}\n    ${f.descripcion}\n    Usos: ${f.usos}\n\n`;
      });
    });
    
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_funciones_${new Date().toISOString().replace(/:/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    if (window.showToast) window.showToast('Reporte generado correctamente');
  });
}

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
export function initPlaylistEvents() {
  document.getElementById('btnLoad')?.addEventListener('click', () => {
    window.__playlistIntent = 'load';
    document.getElementById('midiFile')?.click();
  });
  document.getElementById('btnAddToPlaylist')?.addEventListener('click', () => {
    window.__playlistIntent = 'add';
    document.getElementById('midiFile')?.click();
  });
  document.getElementById('modePromptPractice')?.addEventListener('click', () => {
    window.appMode = 'practice';
    window.applyMode?.('practice');
    document.getElementById('modePromptModal')?.classList.remove('open');
  });
  document.getElementById('modePromptWatch')?.addEventListener('click', () => {
    window.appMode = 'watch';
    window.applyMode?.('watch');
    document.getElementById('modePromptModal')?.classList.remove('open');
  });
  document.getElementById('btnPlaylistPrev')?.addEventListener('click', () => {
    if (!playlist.length) return;
    loadPlaylistAt(currentPlaylistIndex - 1, window.song?.playing);
    refreshPlaylistButtons();
  });
  document.getElementById('btnPlaylistNext')?.addEventListener('click', () => {
    if (!playlist.length) return;
    loadPlaylistAt(currentPlaylistIndex + 1, window.song?.playing);
    refreshPlaylistButtons();
  });

  document.getElementById('midiFile')?.addEventListener('change', function(e) {
    const files = e.target.files;
    if (!files.length) return;
    const intent = window.__playlistIntent || 'load';
    window.__playlistIntent = null;

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
                window.showToast(`${files.length} files added to the playlist`);
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
            window.showToast(`Added: ${files[0].name}`);
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
              window.showToast(`${files.length} files added to the playlist`);
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
            window.showToast(`Added: ${files[0].name}`);
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
      window.showToast(t('dropNotMidi'));
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
      window.showToast(`${midiFiles.length} files added to the playlist`);
      return;
    }
    // Cargar directamente sin preguntar
    loadMidiFile(midiFiles[0], false);
  });
}