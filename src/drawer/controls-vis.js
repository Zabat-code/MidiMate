// ============================================================
// src/drawer/controls-vis.js - Qué controles de la barra superior se ven
//
// Extraído de drawer.js. Módulo sin dependencias fuera de config/i18 porque no
// toca audio ni reproducción: sólo CFG.controlVisibility y el DOM.
// ============================================================

import { CFG, saveConfig } from '../config.js';
import { t } from '../i18.js';

export const CTRL_META = {
  play: 'ctrlPlay',
  connectApi: 'ctrlConnectApi',
  transport: 'ctrlTransport',
  midiIn: 'ctrlMidiIn',
  tempo: 'ctrlTempo',
  volume: 'ctrlVolume',
  fullscreen: 'ctrlFullscreen',
  loop: 'ctrlLoop',
  playlist: 'ctrlPlaylist',
  playlistPrev: 'shortcutPlaylistPrev',
  playlistNext: 'shortcutPlaylistNext',
  record: 'shortcutRecordToggle'
};

export function buildCtrlVisPanel() {
  const list = document.getElementById('ctrlVisList');
  if (!list) return;
  list.innerHTML = '';
  Object.entries(CTRL_META).forEach(([key, labelKey]) => {
    const row = document.createElement('div');
    row.className = 'flag-row';
    row.innerHTML = `<div class="label">${t(labelKey)}</div>
      <button class="icon-btn ${CFG.controlVisibility[key] ? '' : 'off'}" data-ctrlvis="${key}">${CFG.controlVisibility[key] ? '👁' : '🚫'}</button>`;
    list.appendChild(row);
  });
  list.querySelectorAll('[data-ctrlvis]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.ctrlvis;
      CFG.controlVisibility[key] = !CFG.controlVisibility[key];
      btn.textContent = CFG.controlVisibility[key] ? '👁' : '🚫';
      btn.classList.toggle('off', !CFG.controlVisibility[key]);
      applyControlVisibility();
      saveConfig();
    });
  });
}

export function applyControlVisibility() {
  document.querySelectorAll('[data-ctrl]').forEach(el => {
    const key = el.dataset.ctrl;
    el.style.display = CFG.controlVisibility[key] === false ? 'none' : '';
  });
}

// Mientras la categoría "Button assignment" está abierta, mostramos TODOS los
// botones de la barra superior (aunque el usuario los haya ocultado) para que
// pueda ver y parpadear el botón relacionado al reasignar un atajo.
export function setButtonsForceVisible(force) {
  document.querySelectorAll('[data-ctrl]').forEach(el => {
    el.style.display = force ? '' : (CFG.controlVisibility[el.dataset.ctrl] === false ? 'none' : '');
  });
}
