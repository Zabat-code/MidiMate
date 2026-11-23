// ============================================================
// src/drawer/flags.js - Flagsbooleanos y su Representation en el panel
//
// Extraído de drawer.js. Un flag es un valor con metadatos de traducción, así
// que FLAG_META y el panel que lo dibujan tienen que viajar juntos: si se
// separan, un flag nuevo sale sin etiqueta.
// ============================================================

import { CFG, saveConfig } from '../config.js';
import { t } from '../i18.js';
import { resizeCanvases } from '../ui/canvas.js';
import { appMode, updateLoopButton, updatePlayButtonLabel } from '../controls/playback.js';

// ===== FLAGS =====
export const FLAG_META = {
  fallingNotes: { labelKey: 'flagFallingNotes', descKey: 'flagFallingNotesDesc' },
  sheetMusicView: { labelKey: 'flagSheet', descKey: 'flagSheetDesc' },
  followMode: { labelKey: 'flagFollow', descKey: 'flagFollowDesc' },
  accuracyScoring: { labelKey: 'flagAccuracy', descKey: 'flagAccuracyDesc' },
  obsCleanMode: { labelKey: 'flagObs', descKey: 'flagObsDesc' },
  showNoteNames: { labelKey: 'flagNoteNames', descKey: 'flagNoteNamesDesc' },
  showNoteNamesTiles: { labelKey: 'flagNoteNamesTiles', descKey: 'flagNoteNamesTilesDesc' },
  showProgressBar: { labelKey: 'flagProgress', descKey: 'flagProgressDesc' },
  loopSong: { labelKey: 'flagLoop', descKey: 'flagLoopDesc' },
  showBeatLines: { labelKey: 'flagBeatLines', descKey: 'flagBeatLinesDesc' },
  keyPressEffects: { labelKey: 'flagKeyFx', descKey: 'flagKeyFxDesc' },
  autoHideMouse: { labelKey: 'flagAutoHide', descKey: 'flagAutoHideDesc' },
  virtualKeyboardClicks: { labelKey: 'flagVirtualClick', descKey: 'flagVirtualClickDesc' },
  sustainHold: { labelKey: 'flagSustain', descKey: 'flagSustainDesc' },
  touchMode: { labelKey: 'flagTouchMode', descKey: 'flagTouchModeDesc' }
};

export function buildFlagsPanel() {
  const list = document.getElementById('flagsList');
  if (!list) return;
  list.innerHTML = '';
  Object.entries(CFG.flags).forEach(([key, f]) => {
    const meta = FLAG_META[key];
    if (!meta) return;
    const row = document.createElement('div');
    row.className = 'flag-row';
    row.innerHTML = `
      <div>
        <div class="label">${t(meta.labelKey)}</div>
        <div class="desc">${t(meta.descKey)}</div>
      </div>
      <label class="switch">
        <input type="checkbox" data-flag="${key}" ${f.value ? 'checked' : ''}>
        <span class="slider"></span>
      </label>`;
    list.appendChild(row);
  });
  list.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', e => {
      CFG.flags[e.target.dataset.flag].value = e.target.checked;
      applyFlags();
      saveConfig();
    });
  });
}

// ===== APLICAR FUNCIONES =====
export function applyFlags() {
  const sw = document.getElementById('staffWrap');
  if (sw) {
    const show = CFG.flags.sheetMusicView.value;
    sw.classList.toggle('hidden', !show);
    sw.style.height = show ? (CFG.staffHeight || 280) + 'px' : '0px';
  }
  const badge = document.getElementById('accBadge');
  if (badge) {
    badge.style.display = (CFG.flags.accuracyScoring.value && appMode === 'practice') ? 'block' : 'none';
  }
  document.body.classList.toggle('obs-clean', CFG.flags.obsCleanMode.value);
  if (updateLoopButton) updateLoopButton();
  if (updatePlayButtonLabel) updatePlayButtonLabel();
  resizeCanvases();
}
