// ============================================================
// src/controls/tracks.js - Panel de instrumentos por pista
// ============================================================

import { CFG, saveConfig, TRACK_PALETTE } from '../config.js';
import { t } from '../i18.js';
import { song } from './playback.js';

// ===== MAPA DE PROGRAMAS MIDI A PRESETS =====
const PROGRAM_TO_PRESET = {
  0: 'grand', 1: 'grand', 2: 'piano', 3: 'piano', 4: 'epiano', 5: 'epiano',
  6: 'harpsichord', 7: 'harpsichord', 8: 'musicBox', 9: 'musicBox',
  11: 'musicBox', 12: 'bell', 13: 'bell', 14: 'bell', 15: 'bell',
  16: 'organ', 17: 'organ', 18: 'organ', 19: 'organ', 20: 'organ',
  24: 'guitarClassical', 25: 'guitarAcoustic', 26: 'guitarElectric', 27: 'guitarElectric',
  28: 'guitarElectric', 29: 'guitarElectric', 30: 'guitarElectric', 31: 'guitarElectric',
  32: 'contrabass', 33: 'contrabass', 34: 'contrabass', 35: 'contrabass',
  36: 'contrabass', 37: 'contrabass', 38: 'contrabass', 39: 'contrabass',
  40: 'violin', 41: 'violin', 42: 'violin', 43: 'violin',
  44: 'cello', 45: 'cello', 46: 'cello', 47: 'cello',
  48: 'cello', 49: 'cello', 50: 'cello', 51: 'cello',
  52: 'viola', 53: 'viola', 54: 'viola', 55: 'viola',
  56: 'trumpet', 57: 'brass1', 58: 'brass1', 59: 'brass1',
  60: 'brass2', 61: 'brass2', 62: 'brass3', 63: 'brass3',
  64: 'brass3', 65: 'brass3', 66: 'brass3', 67: 'brass3',
  68: 'brass3', 69: 'brass3', 70: 'brass3', 71: 'brass3',
  72: 'brass1', 73: 'brass1', 74: 'brass1', 75: 'brass1',
  76: 'brass1', 77: 'brass1', 78: 'brass1', 79: 'brass1',
  80: 'ocarina', 81: 'ocarina', 82: 'ocarina', 83: 'ocarina',
  84: 'ocarina', 85: 'ocarina', 86: 'ocarina', 87: 'ocarina',
  88: 'ocarina', 89: 'ocarina', 90: 'ocarina', 91: 'ocarina',
  92: 'ocarina', 93: 'ocarina', 94: 'ocarina', 95: 'ocarina',
  96: 'ocarina', 97: 'ocarina', 98: 'ocarina', 99: 'ocarina',
  100: 'ocarina', 101: 'ocarina', 102: 'ocarina', 103: 'ocarina',
  104: 'ocarina', 105: 'ocarina', 106: 'ocarina', 107: 'ocarina',
  108: 'ocarina', 109: 'ocarina', 110: 'ocarina', 111: 'ocarina',
  112: 'bell', 113: 'bell', 114: 'bell', 115: 'bell',
  116: 'bell', 117: 'bell', 118: 'bell', 119: 'bell',
  120: 'bell', 121: 'bell', 122: 'bell', 123: 'bell',
  124: 'bell', 125: 'bell', 126: 'bell', 127: 'bell'
};

const PROGRAM_TO_INSTRUMENT = {
  0: 'Piano de cola', 1: 'Piano de cola brillante', 2: 'Piano vertical', 3: 'Electric piano',
  4: 'Piano eléctrico 2', 5: 'Harpsichord', 6: 'Clavecín 2', 7: 'Clavecín 3',
  8: 'Caja musical', 9: 'Campana', 10: 'Campana 2', 11: 'Campana 3',
  12: 'Glockenspiel', 13: 'Xilófono', 14: 'Vibráfono', 15: 'Marimba',
  16: 'Organ', 17: 'Órgano 2', 18: 'Órgano 3', 19: 'Órgano 4',
  20: 'Acordeón', 21: 'Armónica', 22: 'Bandoneón', 23: 'Bandoneón 2',
  24: 'Spanish guitar', 25: 'Acoustic guitar', 26: 'Electric guitar', 27: 'Guitarra eléctrica 2',
  28: 'Guitarra eléctrica 3', 29: 'Guitarra eléctrica 4', 30: 'Guitarra eléctrica 5', 31: 'Guitarra eléctrica 6',
  32: 'Contrabajo', 33: 'Contrabajo 2', 34: 'Contrabajo 3', 35: 'Contrabajo 4',
  36: 'Contrabajo 5', 37: 'Contrabajo 6', 38: 'Contrabajo 7', 39: 'Contrabajo 8',
  40: 'Violin', 41: 'Violín 2', 42: 'Violín 3', 43: 'Violín 4',
  44: 'Cello', 45: 'Cello 2', 46: 'Cello 3', 47: 'Cello 4',
  48: 'Cello 5', 49: 'Cello 6', 50: 'Cello 7', 51: 'Cello 8',
  52: 'Viola', 53: 'Viola 2', 54: 'Viola 3', 55: 'Viola 4',
  56: 'Trompeta', 57: 'Trombón', 58: 'Tuba', 59: 'Trompeta 2',
  60: 'Corno', 61: 'Corno 2', 62: 'Corno 3', 63: 'Corno 4',
  64: 'Corno 5', 65: 'Corno 6', 66: 'Corno 7', 67: 'Corno 8',
  68: 'Corno 9', 69: 'Corno 10', 70: 'Corno 11', 71: 'Corno 12',
  72: 'Flauta', 73: 'Flauta 2', 74: 'Flauta 3', 75: 'Flauta 4',
  76: 'Flauta 5', 77: 'Flauta 6', 78: 'Flauta 7', 79: 'Flauta 8',
  80: 'Ocarina', 81: 'Ocarina 2', 82: 'Ocarina 3', 83: 'Ocarina 4',
  84: 'Ocarina 5', 85: 'Ocarina 6', 86: 'Ocarina 7', 87: 'Ocarina 8',
  88: 'Ocarina 9', 89: 'Ocarina 10', 90: 'Ocarina 11', 91: 'Ocarina 12',
  92: 'Ocarina 13', 93: 'Ocarina 14', 94: 'Ocarina 15', 95: 'Ocarina 16',
  96: 'Ocarina 17', 97: 'Ocarina 18', 98: 'Ocarina 19', 99: 'Ocarina 20',
  100: 'Ocarina 21', 101: 'Ocarina 22', 102: 'Ocarina 23', 103: 'Ocarina 24',
  104: 'Ocarina 25', 105: 'Ocarina 26', 106: 'Ocarina 27', 107: 'Ocarina 28',
  108: 'Ocarina 29', 109: 'Ocarina 30', 110: 'Ocarina 31', 111: 'Ocarina 32',
  112: 'Campana', 113: 'Campana 2', 114: 'Campana 3', 115: 'Campana 4',
  116: 'Campana 5', 117: 'Campana 6', 118: 'Campana 7', 119: 'Campana 8',
  120: 'Campana 9', 121: 'Campana 10', 122: 'Campana 11', 123: 'Campana 12',
  124: 'Campana 13', 125: 'Campana 14', 126: 'Campana 15', 127: 'Campana 16'
};

export function programToPresetName(prog) {
  const idx = Math.max(0, Math.min(127, prog | 0));
  return PROGRAM_TO_PRESET[idx] || 'piano';
}

export function programToInstrumentName(prog) {
  const p = Math.max(0, Math.min(127, prog | 0));
  return PROGRAM_TO_INSTRUMENT[p] || 'Piano';
}

export function extractProgramsFromTrack(events) {
  const progs = [];
  events.forEach(ev => {
    if (ev.type === 0xC0) progs.push({ channel: ev.channel, prog: ev.d1 });
  });
  return progs;
}

// ===== PANEL DE PISTAS =====
export function buildTracksPanel() {
  const list = document.getElementById('tracksList');
  if (!list) return;
  const keepAll = !!window.__keepAllPreset;
  const keepToggleHTML = `
    <label style="display:flex; align-items:center; gap:6px; font-size:11px; color:var(--ivory-dim); margin-bottom:8px; cursor:pointer;">
      <input type="checkbox" id="keepAllPresetToggle" ${keepAll ? 'checked' : ''}>
      ${t('keepAllPreset') || 'Mantener instrumento en todas las pistas'}
    </label>
  `;
  list.innerHTML = '';
  list.insertAdjacentHTML('afterbegin', keepToggleHTML);
  const keepToggle = document.getElementById('keepAllPresetToggle');
  if (keepToggle) {
    keepToggle.addEventListener('change', e => {
      window.__keepAllPreset = e.target.checked;
      if (!e.target.checked && window.song && window.song.__origPresets) {
        // Al desactivar, restauramos los originales de inmediato.
        for (const k in window.song.__origPresets) {
          if (!window.trackSettings[k]) window.trackSettings[k] = {};
          window.trackSettings[k].preset = window.song.__origPresets[k];
        }
        window.song.__origPresets = null;
        window.song.__tempPreset = null;
        buildTracksPanel();
      }
      window.showToast(t('keepAllPreset') + ': ' + (e.target.checked ? (t('on') || 'ON') : (t('off') || 'OFF')));
    });
  }

  if (!song.notes || !song.notes.length) {
    list.innerHTML = `<div style="font-size:11px; color:var(--ivory-dim);">${t('noTracksYet')}</div>`;
    return;
  }

  const trackSettings = window.trackSettings || {};
  // Listar TODAS las pistas del MIDI (las que tienen notas y las que no,
  // p.ej. pista de metadatos), numeradas por su índice real, para que
  // ninguna quede sin mencionar.
  const midiTracks = window._midiTracks || null;
  const trackIndices = midiTracks
    ? midiTracks.map((_, i) => i)
    : [...new Set(song.notes.map(n => n.track))].sort((a, b) => a - b);

  trackIndices.forEach(trackIdx => {
    // Asegurar que cada pista tenga un color persistido (si no, todas las notas
    // salían blancas al usar el skin "Color por pista" hasta tocar algo manualmente).
    if (!window.trackSettings[trackIdx]) window.trackSettings[trackIdx] = {};
    if (!window.trackSettings[trackIdx].color) {
      window.trackSettings[trackIdx].color = TRACK_PALETTE[trackIdx % TRACK_PALETTE.length];
    }
    const cfg = trackSettings[trackIdx] || {};
    const color = cfg.color;
    const preset = cfg.preset || 'piano';
    const auto = cfg.auto !== false;
    const visible = cfg.visible !== false;
    const disabled = !!cfg.disabled;
    const volume = cfg.volume !== undefined ? cfg.volume : 1.0;
    const pan = cfg.pan !== undefined ? cfg.pan : 0.0;
    const detune = cfg.detune !== undefined ? cfg.detune : 0;
    const reverb = cfg.reverb !== undefined ? cfg.reverb : 0.0;
    const eq = cfg.eq || { low: 0, mid: 0, high: 0 };

    // Nombre del instrumento detectado en esta pista (si lo hay).
    let instrName = '';
    if (midiTracks && midiTracks[trackIdx] && extractProgramsFromTrack) {
      const progs = extractProgramsFromTrack(midiTracks[trackIdx]);
      if (progs.length) instrName = programToInstrumentName(progs[progs.length - 1].prog);
    }
    const hasNotes = song.notes.some(n => n.track === trackIdx);
    const trackTitle = `${t('trackLabel')} ${trackIdx + 1}` +
      (instrName ? ` · ${instrName}` : '') +
      (hasNotes ? '' : ` (${t('trackNoNotes') || 'sin notas'})`);

    const row = document.createElement('div');
    row.className = 'track-row';
    row.style.cssText = 'border:1px solid var(--line); border-radius:8px; padding:8px 10px; margin-bottom:8px; background:rgba(16,14,26,0.3);';
    row.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        <input type="color" data-track-color="${trackIdx}" value="${color}" style="width:22px; height:22px; padding:0; border-radius:3px; flex-shrink:0;">
        <strong style="font-size:12px; flex:1;">${trackTitle}</strong>
        <label style="font-size:10px; color:var(--ivory-dim); display:flex; align-items:center; gap:3px;">
          <input type="checkbox" data-track-mute="${trackIdx}" ${disabled ? 'checked' : ''}> ${t('trackDisable')}
        </label>
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:6px 12px; font-size:11px;">
        <label style="display:flex; align-items:center; gap:4px; color:var(--ivory-dim);">
          ${t('trackAuto')} <input type="checkbox" data-track-auto="${trackIdx}" ${auto ? 'checked' : ''}>
        </label>
        <label style="display:flex; align-items:center; gap:4px; color:var(--ivory-dim);">
          ${t('trackVisible')} <input type="checkbox" data-track-visible="${trackIdx}" ${visible ? 'checked' : ''}>
        </label>
        <label style="display:flex; align-items:center; gap:4px; color:var(--ivory-dim);">
          ${t('soundSource')}
          <select data-track-preset="${trackIdx}" style="font-size:10px; padding:2px 4px;">
            ${Object.keys(PRESET_OPTIONS).map(p => `<option value="${p}" ${preset === p ? 'selected' : ''}>${PRESET_OPTIONS[p]}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="track-mix-controls">
        <label>Vol <input type="range" data-track-volume="${trackIdx}" min="0" max="200" value="${Math.round(volume * 100)}"><span class="val">${Math.round(volume * 100)}%</span></label>
        <label>Pan <input type="range" data-track-pan="${trackIdx}" min="-100" max="100" value="${Math.round(pan * 100)}"><span class="val">${Math.round(pan * 100)}</span></label>
        <label>Det <input type="range" data-track-detune="${trackIdx}" min="-50" max="50" value="${detune}"><span class="val">${detune}</span></label>
        <label>Rev <input type="range" data-track-reverb="${trackIdx}" min="0" max="100" value="${Math.round(reverb * 100)}"><span class="val">${Math.round(reverb * 100)}%</span></label>
      </div>
      <div class="eq-row">
        <label>EQ <input type="range" data-track-eq-low="${trackIdx}" min="-12" max="12" value="${eq.low}"><span>${eq.low}</span></label>
        <label><input type="range" data-track-eq-mid="${trackIdx}" min="-12" max="12" value="${eq.mid}"><span>${eq.mid}</span></label>
        <label><input type="range" data-track-eq-high="${trackIdx}" min="-12" max="12" value="${eq.high}"><span>${eq.high}</span></label>
      </div>
    `;
    list.appendChild(row);
  });

  // Eventos
  list.querySelectorAll('[data-track-color]').forEach(inp => {
    inp.addEventListener('input', e => {
      const idx = +e.target.dataset.trackColor;
      if (!window.trackSettings[idx]) window.trackSettings[idx] = {};
      window.trackSettings[idx].color = e.target.value;
      saveConfig();
    });
  });
  list.querySelectorAll('[data-track-mute]').forEach(cb => {
    cb.addEventListener('change', e => {
      const idx = +e.target.dataset.trackMute;
      if (!window.trackSettings[idx]) window.trackSettings[idx] = {};
      window.trackSettings[idx].disabled = e.target.checked;
      saveConfig();
    });
  });
  list.querySelectorAll('[data-track-auto]').forEach(cb => {
    cb.addEventListener('change', e => {
      const idx = +e.target.dataset.trackAuto;
      if (!window.trackSettings[idx]) window.trackSettings[idx] = {};
      window.trackSettings[idx].auto = e.target.checked;
      saveConfig();
    });
  });
  list.querySelectorAll('[data-track-visible]').forEach(cb => {
    cb.addEventListener('change', e => {
      const idx = +e.target.dataset.trackVisible;
      if (!window.trackSettings[idx]) window.trackSettings[idx] = {};
      window.trackSettings[idx].visible = e.target.checked;
      saveConfig();
    });
  });
  list.querySelectorAll('[data-track-preset]').forEach(sel => {
    sel.addEventListener('change', e => {
      const idx = +e.target.dataset.trackPreset;
      const value = e.target.value;
      // Aplica el instrumento elegido a TODAS las pistas, pero solo para la
      // canción que se está reproduciendo (override temporal en memoria).
      // No sobrescribe la config guardada de otras canciones.
      if (window.song && window.song.notes && window.song.notes.length) {
        const total = Math.max(...window.song.notes.map(n => n.track), 0) + 1;
        // Si el toggle "mantener" está activo, no guardamos snapshot de
        // originales: el override persiste aunque se detenga la canción.
        if (!window.__keepAllPreset && !window.song.__origPresets) {
          window.song.__origPresets = {};
          for (let i = 0; i < total; i++) {
            if (!window.trackSettings[i]) window.trackSettings[i] = {};
            window.song.__origPresets[i] = window.trackSettings[i].preset || 'piano';
          }
        }
        window.song.__tempPreset = value;
        for (let i = 0; i < total; i++) {
          if (!window.trackSettings[i]) window.trackSettings[i] = {};
          window.trackSettings[i].preset = value;
        }
        // Refleja el cambio en los demás selects de la UI sin recargar.
        list.querySelectorAll('[data-track-preset]').forEach(other => {
          if (other !== e.target) other.value = value;
        });
        window.showToast(t('soundSourceAllApplied') || 'Instrumento aplicado a todas las pistas (esta canción)');
      } else {
        // Sin canción cargada: comportamiento normal (solo esta pista).
        if (!window.trackSettings[idx]) window.trackSettings[idx] = {};
        window.trackSettings[idx].preset = value;
        saveConfig();
      }
    });
  });
  list.querySelectorAll('[data-track-volume]').forEach(inp => {
    inp.addEventListener('input', e => {
      const idx = +e.target.dataset.trackVolume;
      if (!window.trackSettings[idx]) window.trackSettings[idx] = {};
      window.trackSettings[idx].volume = +e.target.value / 100;
      e.target.nextElementSibling.textContent = e.target.value + '%';
      saveConfig();
    });
  });
  list.querySelectorAll('[data-track-pan]').forEach(inp => {
    inp.addEventListener('input', e => {
      const idx = +e.target.dataset.trackPan;
      if (!window.trackSettings[idx]) window.trackSettings[idx] = {};
      window.trackSettings[idx].pan = +e.target.value / 100;
      e.target.nextElementSibling.textContent = e.target.value;
      saveConfig();
    });
  });
  list.querySelectorAll('[data-track-detune]').forEach(inp => {
    inp.addEventListener('input', e => {
      const idx = +e.target.dataset.trackDetune;
      if (!window.trackSettings[idx]) window.trackSettings[idx] = {};
      window.trackSettings[idx].detune = +e.target.value;
      e.target.nextElementSibling.textContent = e.target.value;
      saveConfig();
    });
  });
  list.querySelectorAll('[data-track-reverb]').forEach(inp => {
    inp.addEventListener('input', e => {
      const idx = +e.target.dataset.trackReverb;
      if (!window.trackSettings[idx]) window.trackSettings[idx] = {};
      window.trackSettings[idx].reverb = +e.target.value / 100;
      e.target.nextElementSibling.textContent = e.target.value + '%';
      saveConfig();
    });
  });
  list.querySelectorAll('[data-track-eq-low]').forEach(inp => {
    inp.addEventListener('input', e => {
      const idx = +e.target.dataset.trackEqLow;
      if (!window.trackSettings[idx]) window.trackSettings[idx] = {};
      if (!window.trackSettings[idx].eq) window.trackSettings[idx].eq = { low: 0, mid: 0, high: 0 };
      window.trackSettings[idx].eq.low = +e.target.value;
      e.target.nextElementSibling.textContent = e.target.value;
      saveConfig();
    });
  });
  list.querySelectorAll('[data-track-eq-mid]').forEach(inp => {
    inp.addEventListener('input', e => {
      const idx = +e.target.dataset.trackEqMid;
      if (!window.trackSettings[idx]) window.trackSettings[idx] = {};
      if (!window.trackSettings[idx].eq) window.trackSettings[idx].eq = { low: 0, mid: 0, high: 0 };
      window.trackSettings[idx].eq.mid = +e.target.value;
      e.target.nextElementSibling.textContent = e.target.value;
      saveConfig();
    });
  });
  list.querySelectorAll('[data-track-eq-high]').forEach(inp => {
    inp.addEventListener('input', e => {
      const idx = +e.target.dataset.trackEqHigh;
      if (!window.trackSettings[idx]) window.trackSettings[idx] = {};
      if (!window.trackSettings[idx].eq) window.trackSettings[idx].eq = { low: 0, mid: 0, high: 0 };
      window.trackSettings[idx].eq.high = +e.target.value;
      e.target.nextElementSibling.textContent = e.target.value;
      saveConfig();
    });
  });
}

const PRESET_OPTIONS = {
  piano: 'Piano sintetizado', grand: 'Piano de cola', upright: 'Piano vertical',
  harpsichord: 'Harpsichord', epiano: 'Electric piano', organ: 'Organ',
  pad: 'Pad suave', bell: 'Campana', violin: 'Violin', viola: 'Viola',
  cello: 'Cello', contrabass: 'Contrabajo', guitarClassical: 'Spanish guitar',
  guitarAcoustic: 'Acoustic guitar', guitarElectric: 'Electric guitar',
  musicBox: 'Caja musical', perc1: 'Percusión 1', perc2: 'Percusión 2',
  perc3: 'Percusión 3', timpani: 'Timpani', flute: 'Flauta', saxophone: 'Saxophone',
  ocarina: 'Ocarina', clarinet: 'Clarinete', oboe: 'Oboe', bassoon: 'Fagot',
  brass1: 'Metales 1', brass2: 'Metales 2', brass3: 'Metales 3', tuba: 'Tuba',
  sample: 'Muestra local'
};