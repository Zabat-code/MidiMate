// ============================================================
// src/controls/drawer.js - Panel de ajustes (drawer) y flags
// ============================================================

import { CFG, saveConfig, TRACK_PALETTE, STORAGE_KEY } from '../config.js';
import { t, applyI18n } from '../i18.js';
import { resizeCanvases } from '../ui/canvas.js';
import { applyKeyboardRange, setKeyLayout, setKeyState, getKeyLayout } from '../ui/keys.js';
import { applyMode, updatePlayButtonLabel, updateLoopButton, song, trackSettings, showToast } from './playback.js';
import { setupWebMidi } from './keyboard.js';
import { renderPlaylist } from '../playlist.js';
import { setEqPreset, analyzeAndOptimizeMidi, populateSampleBaseNoteSelect, EQ_PRESETS } from '../audio.js';

// Guarda el conteo de teclas previo al abrir la categoría "buttons".
let buttonsPrevKeyCount = null;
import { initReportButton } from '../report.js';

// ===== TEMAS DE COLOR =====
export const THEMES = {
  brass: { accent: '#c9a24b', accentSoft: '#e0bd6d', noteWhite: '127,179,213', noteBlack: '201,162,75', played: '111,191,115' },
  ocean: { accent: '#3fa7c9', accentSoft: '#6fc9e0', noteWhite: '111,180,230', noteBlack: '63,167,201', played: '111,220,191' },
  rose: { accent: '#c96b9a', accentSoft: '#e08fc0', noteWhite: '201,140,220', noteBlack: '201,107,154', played: '201,150,180' },
  emerald: { accent: '#4ec98f', accentSoft: '#7de0ae', noteWhite: '120,200,170', noteBlack: '78,201,143', played: '180,220,120' },
  mono: { accent: '#b9b9b9', accentSoft: '#d8d8d8', noteWhite: '170,170,170', noteBlack: '120,120,120', played: '210,210,210' }
};

export const CHROMA_COLORS = [
  '255,99,71', '255,165,0', '255,215,0', '154,205,50', '60,179,113', '32,178,170',
  '30,144,255', '65,105,225', '138,43,226', '186,85,211', '219,112,147', '255,105,180'
];

export function currentTheme() {
  return THEMES[CFG.colorTheme] || THEMES.brass;
}

export function applyColorTheme() {
  const th = currentTheme();
  document.documentElement.style.setProperty('--brass', th.accent);
  document.documentElement.style.setProperty('--brass-soft', th.accentSoft);
}

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

export const CTRL_META = {
  play: 'ctrlPlay',
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

// ===== CONSTRUIR PANELES =====
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

// Pestaña de capa de fondo activa.
let bgLayerActive = 0;

export function buildBgLayersPanel() {
  const tabsEl = document.getElementById('bgLayerTabs');
  const panel = document.getElementById('bgLayersPanel');
  if (!panel) return;
  if (bgLayerActive >= CFG.background.layers.length) bgLayerActive = 0;
  // Tabs (layer1/layer2/layer3)
  if (tabsEl) {
    tabsEl.innerHTML = '';
    CFG.background.layers.forEach((_, idx) => {
      const tab = document.createElement('button');
      tab.className = 'bg-layer-tab' + (idx === bgLayerActive ? ' active' : '');
      tab.textContent = `${t('bgLayerTitle')} ${idx + 1}`;
      tab.addEventListener('click', () => {
        bgLayerActive = idx;
        buildBgLayersPanel();
      });
      tabsEl.appendChild(tab);
    });
  }
  panel.innerHTML = '';
  const idx = bgLayerActive;
  const layer = CFG.background.layers[idx];
  if (!layer) return;
  const fileLabel = layer.file ? (layer.type === 'video' ? t('bgLayerHasVideo') : t('bgLayerHasImage')) : t('bgLayerEmpty');
  panel.innerHTML = `
    <div class="subtle-field">
      <span>${t('bgLayerTitle')} ${idx + 1} <span style="font-weight:400; color:var(--ivory-dim);">(${fileLabel})</span></span>
    </div>
    <div class="subtle-field">
      <input type="file" data-layer-file="${idx}" accept="image/*,video/mp4,video/webm,video/ogg">
      <button data-layer-clear="${idx}" style="align-self:flex-start;">${t('removeImage')}</button>
    </div>
    <div class="subtle-field">
      <span>${t('bgLayerOrderLabel')}</span>
      <select data-layer-order="${idx}">
        <option value="back">${t('bgOrderBack')}</option>
        <option value="middle">${t('bgOrderMiddle')}</option>
        <option value="front">${t('bgOrderFront')}</option>
      </select>
    </div>
    <div class="subtle-field">
      <span>${t('bgPanXLabel')}</span>
      <input type="range" data-layer-x="${idx}" min="-50" max="150" value="${layer.x}">
    </div>
    <div class="subtle-field">
      <span>${t('bgPanYLabel')}</span>
      <input type="range" data-layer-y="${idx}" min="-50" max="150" value="${layer.y}">
    </div>
    <div class="subtle-field">
      <span>${t('bgZoomLabel')}</span>
      <input type="range" data-layer-zoom="${idx}" min="10" max="300" value="${layer.zoom}">
    </div>
    <div class="subtle-field">
      <span>${t('imageOpacity')}</span>
      <input type="range" data-layer-opacity="${idx}" min="0" max="100" value="${Math.round(layer.opacity * 100)}">
    </div>`;
  panel.querySelector(`[data-layer-order="${idx}"]`).value = layer.order;

  // Eventos para capas
  panel.querySelectorAll('[data-layer-file]').forEach(inp => {
    inp.addEventListener('change', e => {
      const idx = +e.target.dataset.layerFile;
      const file = e.target.files[0];
      if (!file) return;
      const isVideo = file.type.startsWith('video/');
      const reader = new FileReader();
      reader.onload = () => {
        CFG.background.layers[idx].file = reader.result;
        CFG.background.layers[idx].type = isVideo ? 'video' : 'image';
        applyBgLayer(idx);
        buildBgLayersPanel();
        saveConfig();
      };
      reader.readAsDataURL(file);
    });
  });

  panel.querySelectorAll('[data-layer-clear]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = +btn.dataset.layerClear;
      CFG.background.layers[idx].file = null;
      CFG.background.layers[idx].type = null;
      applyBgLayer(idx);
      buildBgLayersPanel();
      saveConfig();
    });
  });

  panel.querySelectorAll('[data-layer-order]').forEach(sel => {
    sel.addEventListener('change', e => {
      const idx = +e.target.dataset.layerOrder;
      const newOrder = e.target.value;
      // Exclusividad: solo una capa puede ser frente/medio/fondo. Si otra
      // capa ya tiene este orden, intercambiamos los órdenes.
      const other = CFG.background.layers.findIndex((l, i) => i !== idx && l.order === newOrder);
      if (other !== -1) {
        CFG.background.layers[other].order = CFG.background.layers[idx].order;
        applyBgLayer(other);
      }
      CFG.background.layers[idx].order = newOrder;
      applyBgLayer(idx);
      buildBgLayersPanel();
      saveConfig();
    });
  });

  panel.querySelectorAll('[data-layer-x]').forEach(inp => {
    inp.addEventListener('input', e => {
      const idx = +e.target.dataset.layerX;
      CFG.background.layers[idx].x = +e.target.value;
      applyBgLayer(idx);
      saveConfig();
    });
  });

  panel.querySelectorAll('[data-layer-y]').forEach(inp => {
    inp.addEventListener('input', e => {
      const idx = +e.target.dataset.layerY;
      CFG.background.layers[idx].y = +e.target.value;
      applyBgLayer(idx);
      saveConfig();
    });
  });

  panel.querySelectorAll('[data-layer-zoom]').forEach(inp => {
    inp.addEventListener('input', e => {
      const idx = +e.target.dataset.layerZoom;
      CFG.background.layers[idx].zoom = +e.target.value;
      applyBgLayer(idx);
      saveConfig();
    });
  });

  panel.querySelectorAll('[data-layer-opacity]').forEach(inp => {
    inp.addEventListener('input', e => {
      const idx = +e.target.dataset.layerOpacity;
      CFG.background.layers[idx].opacity = +e.target.value / 100;
      applyBgLayer(idx);
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
    badge.style.display = (CFG.flags.accuracyScoring.value && window.appMode === 'practice') ? 'block' : 'none';
  }
  document.body.classList.toggle('obs-clean', CFG.flags.obsCleanMode.value);
  if (window.updateLoopButton) window.updateLoopButton();
  if (window.updatePlayButtonLabel) window.updatePlayButtonLabel();
  resizeCanvases();
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

// ===== DRAWER =====
export function setDrawerOpen(open) {
  const drawer = document.getElementById('drawer');
  const floatBtn = document.getElementById('floatSettings');
  const backdrop = document.getElementById('drawerBackdrop');
  if (drawer) drawer.classList.toggle('open', open);
  if (floatBtn) floatBtn.style.display = open ? 'none' : '';
  // En overlay (pantalla completa) mostramos un velo que bloquea la app:
  // el usuario no puede interactuar con el teclado mientras el menú está abierto.
  // En sidebar el velo está oculto para poder tocar el teclado.
  if (backdrop) backdrop.classList.toggle('open', open && CFG.drawerLayout !== 'sidebar');
  // Al abrir en sidebar, marcamos el panel como área activa por defecto.
  if (open && CFG.drawerLayout === 'sidebar') {
    document.body.classList.add('area-drawer');
    document.body.classList.remove('area-keyboard');
  } else if (!open) {
    document.body.classList.remove('area-drawer', 'area-keyboard');
  }
  // En layout sidebar el drawer se monta al lado y desplaza el contenido
  // (margin-right). Hay que redibujar los canvas al nuevo ancho para que las
  // teclas se reescalen y se vean completas. La transición es 0.25s.
  if (CFG.drawerLayout === 'sidebar' && window.resizeCanvases) {
    setTimeout(() => window.resizeCanvases?.(), 280);
  }
}

// ===== ABRIR CATEGORIA =====
export function openGroup(name) {
  const group = document.querySelector('.settings-group[data-group="' + name + '"]');
  if (group) {
    group.classList.add('open');
    group.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// ===== FONDO =====
export function applyBackground() {
  document.getElementById('bgColorLayer').style.background = CFG.background.color;
  CFG.background.layers.forEach((layer, idx) => applyBgLayer(idx));
}

function applyBgLayer(idx) {
  const layer = CFG.background.layers[idx];
  const container = document.getElementById('bgLayer' + idx);
  if (!container) return;
  container.innerHTML = '';
  const zMap = { back: -9, middle: -8, front: -7 };
  container.style.zIndex = zMap[layer.order] != null ? zMap[layer.order] : (-9 + idx);
  container.style.opacity = layer.opacity;
  if (!layer.file) return;
  let el;
  if (layer.type === 'video') {
    el = document.createElement('video');
    el.src = layer.file;
    el.muted = true;
    el.loop = true;
    el.autoplay = true;
    el.playsInline = true;
    el.addEventListener('canplay', () => el.play().catch(() => {}));
  } else {
    el = document.createElement('img');
    el.src = layer.file;
  }
  el.style.left = layer.x + '%';
  el.style.top = layer.y + '%';
  el.style.transform = `translate(-50%,-50%) scale(${layer.zoom / 100})`;
  container.appendChild(el);
}

// ===== CONFIGURATION EVENTS (initialization) =====
export function initDrawerEvents() {
  // Drawer open/close
  document.getElementById('floatSettings')?.addEventListener('click', () => {
    setDrawerOpen(!document.getElementById('drawer').classList.contains('open'));
  });
  document.getElementById('drawerClose')?.addEventListener('click', () => {
    setDrawerOpen(false);
  });

  // Toggle de categorias al hacer click en el encabezado
  document.querySelectorAll('.group-header[data-group-toggle]').forEach(header => {
    header.addEventListener('click', () => {
      const group = header.closest('.settings-group');
      if (!group) return;
      const willOpen = !group.classList.contains('open');
      group.classList.toggle('open');
      // Al abrir la categoría de asignación de teclas (buttons), mostramos
      // TODAS las teclas del piano y TODOS los botones de la barra superior
      // para que el usuario vea dónde cae cada tecla física y parpadee el
      // botón relacionado al reasignar un atajo; al cerrar, volvemos a su
      // conteo y visibilidad guardados.
      if (group.dataset.group === 'buttons') {
        if (willOpen) {
          buttonsPrevKeyCount = CFG.visibleKeyCount;
          CFG.visibleKeyCount = 'opt4';
          setButtonsForceVisible(true);
        } else {
          if (buttonsPrevKeyCount != null) {
            CFG.visibleKeyCount = buttonsPrevKeyCount;
            buttonsPrevKeyCount = null;
          }
          setButtonsForceVisible(false);
        }
        if (window.applyKeyboardRange) window.applyKeyboardRange();
      }
    });
  });

  // Idioma
  document.getElementById('langSelect')?.addEventListener('change', e => {
    CFG.language = e.target.value;
    saveConfig();
    applyI18n();
  });

  // Layout
  document.getElementById('drawerLayoutSelect')?.addEventListener('change', e => {
    CFG.drawerLayout = e.target.value;
    applyDrawerLayout();
    saveConfig();
  });

  // Colores
  document.getElementById('settingsBgColorInput')?.addEventListener('input', e => {
    CFG.settingsBgColor = e.target.value;
    applySettingsBg();
    saveConfig();
  });
  document.getElementById('panelColorInput')?.addEventListener('input', e => {
    CFG.panelColor = e.target.value;
    applyPanelColor();
    saveConfig();
  });
  document.getElementById('staffNoteColorInput')?.addEventListener('input', e => {
    CFG.staffColors.noteColor = e.target.value;
    saveConfig();
  });
  document.getElementById('staffBgColorInput')?.addEventListener('input', e => {
    CFG.staffColors.bgColor = e.target.value;
    saveConfig();
  });
  document.getElementById('countInEnable')?.addEventListener('change', e => {
    CFG.countIn.enabled = e.target.checked;
    saveConfig();
  });
  document.getElementById('countInAudio')?.addEventListener('change', e => {
    CFG.countIn.audio = e.target.checked;
    saveConfig();
  });
  document.getElementById('colorThemeSelect')?.addEventListener('change', e => {
    CFG.colorTheme = e.target.value;
    applyColorTheme();
    saveConfig();
  });
  document.getElementById('bgColorInput')?.addEventListener('input', e => {
    CFG.background.color = e.target.value;
    applyBackground();
    saveConfig();
  });
  document.getElementById('keySkinSelect')?.addEventListener('change', e => {
    CFG.keySkin = e.target.value;
    saveConfig();
  });
  document.getElementById('keyCountSelect')?.addEventListener('change', e => {
    CFG.visibleKeyCount = e.target.value;
    saveConfig();
    applyKeyboardRange();
  });
  document.getElementById('tileSkinSelect')?.addEventListener('change', e => {
    CFG.tileSkin = e.target.value;
    saveConfig();
  });
  document.getElementById('keyFxStyleSelect')?.addEventListener('change', e => {
    CFG.keyFxStyle = e.target.value;
    saveConfig();
  });
  document.getElementById('toastDurationInput')?.addEventListener('input', e => {
    CFG.toastDuration = +e.target.value;
    document.getElementById('toastDurationVal').textContent = e.target.value + 's';
    saveConfig();
  });
  document.getElementById('announceEnable')?.addEventListener('change', e => {
    CFG.announce.enabled = e.target.checked;
    saveConfig();
  });
  document.getElementById('announceTextInput')?.addEventListener('input', e => {
    CFG.announce.text = e.target.value;
    saveConfig();
  });
  document.getElementById('announceFontSelect')?.addEventListener('change', e => {
    CFG.announce.font = e.target.value;
    saveConfig();
  });
  document.getElementById('announceSizeInput')?.addEventListener('input', e => {
    CFG.announce.size = +e.target.value;
    document.getElementById('announceSizeVal').textContent = e.target.value + 'px';
    saveConfig();
  });
  document.getElementById('announceColorInput')?.addEventListener('input', e => {
    CFG.announce.color = e.target.value;
    saveConfig();
  });
  document.getElementById('noteNamingSelect')?.addEventListener('change', e => {
    CFG.noteNaming = e.target.value;
    saveConfig();
  });
  document.getElementById('freeDisplaySelect')?.addEventListener('change', e => {
    CFG.freeModeDisplay = e.target.value;
    saveConfig();
  });

  // Harmonize button
  document.getElementById('btnHarmonize')?.addEventListener('click', harmonizeWithImage);

  // Report button
  initReportButton();

  // Factory reset button
  document.getElementById('btnFactoryReset')?.addEventListener('click', () => {
    const ok = confirm('Are you sure you want to reset everything? This deletes the saved configuration (themes, shortcuts, playlist, settings) and reloads the page with factory values. This action cannot be undone.');
    if (!ok) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    location.reload();
  });

  // MIDI analysis
  document.getElementById('btnAnalyzeMidi')?.addEventListener('click', analyzeAndOptimizeMidi);

  // Synth preset
  document.getElementById('synthPreset')?.addEventListener('change', e => {
    CFG.synth.preset = e.target.value;
    document.getElementById('sampleFields').style.display = (e.target.value === 'sample') ? 'flex' : 'none';
    saveConfig();
  });

  // Sample
  document.getElementById('sampleInput')?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const actx = window.actx;
      if (!actx) return;
      actx.decodeAudioData(reader.result.slice(0), buf => {
        window.sampleBuffer = buf;
        window.showToast(t('sampleLoaded') + file.name);
      }, () => { window.showToast(t('sampleDecodeError')); });
      const r2 = new FileReader();
      r2.onload = () => {
        CFG.synth.sampleDataUrl = r2.result;
        saveConfig();
      };
      r2.readAsDataURL(file);
    };
    reader.readAsArrayBuffer(file);
  });
  document.getElementById('sampleBaseNote')?.addEventListener('change', e => {
    CFG.synth.sampleBaseNote = +e.target.value;
    saveConfig();
  });

  // Metronome
  document.getElementById('metroEnable')?.addEventListener('change', e => {
    CFG.metronome.enabled = e.target.checked;
    saveConfig();
  });
  document.getElementById('metroBpm')?.addEventListener('input', e => {
    CFG.metronome.bpm = +e.target.value;
    document.getElementById('metroBpmVal').textContent = e.target.value + ' BPM';
    saveConfig();
  });

  // EQ
  document.getElementById('eqLowInput')?.addEventListener('input', e => {
    CFG.eq.low = +e.target.value;
    const eqLow = window.eqLow;
    if (eqLow) eqLow.gain.value = CFG.eq.low;
    document.getElementById('eqLowVal').textContent = e.target.value + 'dB';
    saveConfig();
  });
  document.getElementById('eqMidInput')?.addEventListener('input', e => {
    CFG.eq.mid = +e.target.value;
    const eqMid = window.eqMid;
    if (eqMid) eqMid.gain.value = CFG.eq.mid;
    document.getElementById('eqMidVal').textContent = e.target.value + 'dB';
    saveConfig();
  });
  document.getElementById('eqHighInput')?.addEventListener('input', e => {
    CFG.eq.high = +e.target.value;
    const eqHigh = window.eqHigh;
    if (eqHigh) eqHigh.gain.value = CFG.eq.high;
    document.getElementById('eqHighVal').textContent = e.target.value + 'dB';
    saveConfig();
  });
  document.getElementById('eqPresetSelect')?.addEventListener('change', e => setEqPreset(e.target.value));

  // Bass amount
  document.getElementById('bassAmountInput')?.addEventListener('input', e => {
    CFG.bassAmount = +e.target.value / 100;
    document.getElementById('bassAmountVal').textContent = e.target.value + '%';
    saveConfig();
  });

  // Realistic audio
  document.getElementById('realisticAudioToggle')?.addEventListener('change', e => {
    CFG.realisticAudio.enabled = e.target.checked;
    saveConfig();
  });

  // Humanize
  document.getElementById('humanizeEnable')?.addEventListener('change', function() {
    CFG.humanize.enabled = this.checked;
    saveConfig();
  });

  // Swing
  document.getElementById('swingAmount')?.addEventListener('input', function() {
    const val = parseInt(this.value);
    CFG.swing.amount = val;
    document.getElementById('swingValueLabel').textContent = val + '%';
    saveConfig();
  });

  // Mouse hide delay
  document.getElementById('mouseHideDelayInput')?.addEventListener('input', e => {
    CFG.mouseHideDelay = +e.target.value;
    document.getElementById('mouseHideDelayVal').textContent = e.target.value + 's';
    saveConfig();
  });

  // Difficulty level
  document.getElementById('difficultyLevelSelect')?.addEventListener('change', e => {
    CFG.difficultyLevel = e.target.value;
    applyDifficultyLevel();
    saveConfig();
  });

  // Perspective 3D
  document.getElementById('perspective3DEnable')?.addEventListener('change', e => {
    CFG.flags.perspective3D.value = e.target.checked;
    saveConfig();
  });
  document.getElementById('perspectiveDepthInput')?.addEventListener('input', e => {
    CFG.perspectiveDepth = +e.target.value;
    document.getElementById('perspectiveDepthVal').textContent = e.target.value + '%';
    saveConfig();
  });

  // BPM Pulse
  document.getElementById('bpmPulseEnable')?.addEventListener('change', e => {
    CFG.flags.bpmPulse.value = e.target.checked;
    saveConfig();
  });
  document.getElementById('pulseIntensityInput')?.addEventListener('input', e => {
    CFG.pulseIntensity = +e.target.value / 100;
    document.getElementById('pulseIntensityVal').textContent = e.target.value + '%';
    saveConfig();
  });

  // Dynamic camera
  document.getElementById('dynamicCameraEnable')?.addEventListener('change', e => {
    CFG.flags.dynamicCamera.value = e.target.checked;
    saveConfig();
  });
  document.getElementById('cameraSmoothingInput')?.addEventListener('input', e => {
    CFG.cameraSmoothing = +e.target.value / 100;
    document.getElementById('cameraSmoothingVal').textContent = e.target.value + '%';
    saveConfig();
  });

  // Show chord names
  document.getElementById('showChordNamesEnable')?.addEventListener('change', e => {
    CFG.flags.showChordNames.value = e.target.checked;
    saveConfig();
  });

  syncAdvancedSettingsUI();
  buildModeTabs();

  // Clic en el velo (overlay) cierra el drawer.
  document.getElementById('drawerBackdrop')?.addEventListener('click', () => {
    setDrawerOpen(false);
  });

  // En sidebar: marcar el área que el usuario está usando (teclado o panel),
  // de modo que solo una quede activa a la vez y se resalte visualmente.
  const mainEl = document.querySelector('main');
  const drawerEl = document.getElementById('drawer');
  if (mainEl) {
    mainEl.addEventListener('pointerdown', () => {
      if (!document.body.classList.contains('layout-sidebar')) return;
      document.body.classList.add('area-keyboard');
      document.body.classList.remove('area-drawer');
    });
  }
  if (drawerEl) {
    drawerEl.addEventListener('pointerdown', () => {
      if (!document.body.classList.contains('layout-sidebar')) return;
      document.body.classList.add('area-drawer');
      document.body.classList.remove('area-keyboard');
    });
  }
}

// ===== SINCRONIZAR CONTROLES AVANZADOS CON CFG (al cargar) =====
export function syncAdvancedSettingsUI() {
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  const setChecked = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  const levelSelect = document.getElementById('difficultyLevelSelect');
  if (levelSelect && CFG.difficultyPresets[CFG.difficultyLevel]) levelSelect.value = CFG.difficultyLevel;

  setChecked('perspective3DEnable', CFG.flags.perspective3D.value);
  setVal('perspectiveDepthInput', CFG.perspectiveDepth);
  setText('perspectiveDepthVal', CFG.perspectiveDepth + '%');

  setChecked('bpmPulseEnable', CFG.flags.bpmPulse.value);
  setVal('pulseIntensityInput', Math.round(CFG.pulseIntensity * 100));
  setText('pulseIntensityVal', Math.round(CFG.pulseIntensity * 100) + '%');

  setChecked('dynamicCameraEnable', CFG.flags.dynamicCamera.value);
  setVal('cameraSmoothingInput', Math.round(CFG.cameraSmoothing * 100));
  setText('cameraSmoothingVal', Math.round(CFG.cameraSmoothing * 100) + '%');

  setChecked('showChordNamesEnable', CFG.flags.showChordNames.value);
}

// ===== APPLY DESIGN =====
export function applyDrawerLayout() {
  document.body.classList.toggle('layout-sidebar', CFG.drawerLayout === 'sidebar');
  document.body.classList.toggle('layout-dynamic', CFG.drawerLayout === 'dynamic');
  // Forzar height limpio al cambiar de layout (evita bugs de scroll/overflow)
  const drawer = document.getElementById('drawer');
  if (drawer) {
    drawer.style.height = CFG.drawerLayout === 'sidebar' ? '100%' : '';
  }
  applyGroupDefaults();
  // Re-evaluar el filtro por modo: en layout dinámico se muestran TODAS las
  // opciones sin importar el modo activo (limpia cualquier hidden-by-mode).
  applyModeFilter(window.appMode || 'watch');
  // Keep the layout <select> in sync with the actual config so the displayed
  // option matches CFG (otherwise the browser shows the first option while
  // the real layout is different, forcing the user to change it twice).
  const layoutSel = document.getElementById('drawerLayoutSelect');
  if (layoutSel) layoutSel.value = CFG.drawerLayout;
  const langSel = document.getElementById('langSelect');
  if (langSel) langSel.value = CFG.language || 'es';
}

function applyGroupDefaults() {
  const isSidebar = CFG.drawerLayout === 'sidebar';
  const isDynamic = CFG.drawerLayout === 'dynamic';
  document.querySelectorAll('.settings-group').forEach((g, i) => {
    const name = g.dataset.group;
    // En fullscreen las categorías se ven todas (acordeón abierto); en
    // sidebar solo "general" por defecto; en dynamic se usan pestañas
    // (todas abiertas, pero solo la activa visible vía CSS .cat-active).
    const shouldOpen = (isSidebar ? name === 'general' : true);
    g.classList.toggle('open', shouldOpen);
    if (isDynamic) {
      g.classList.toggle('cat-active', i === 0);
    } else {
      g.classList.remove('cat-active');
    }
  });
  buildCategoryTabs();
  applyDynColumns();
}

// Pestañas de categorías para el layout "pantalla completa dinámica".
// Toma el título ya traducido de cada group-header y lo usa como etiqueta.
function buildCategoryTabs() {
  const tabsEl = document.getElementById('drawerCatTabs');
  if (!tabsEl) return;
  const groups = Array.from(document.querySelectorAll('.settings-group'));
  tabsEl.innerHTML = '';
  groups.forEach((g, i) => {
    const header = g.querySelector('.group-header');
    const label = header ? header.textContent.replace(/[▸]/g, '').trim() : g.dataset.group;
    const tab = document.createElement('button');
    tab.className = 'drawer-cat-tab' + (g.classList.contains('cat-active') ? ' active' : '');
    tab.textContent = label;
    tab.addEventListener('click', () => {
      groups.forEach((gg, j) => gg.classList.toggle('cat-active', j === i));
      applyDynColumns();
      buildCategoryTabs();
    });
    tabsEl.appendChild(tab);
  });
}

// En layout dinámico: si la categoría tiene pocas opciones, una sola columna
// centrada; si tiene muchas, dos columnas que aprovechan todo el ancho.
function applyDynColumns() {
  if (CFG.drawerLayout !== 'dynamic') return;
  const active = document.querySelector('.settings-group.cat-active');
  if (!active) return;
  const body = active.querySelector('.group-body');
  if (!body) return;
  const fields = body.querySelectorAll('.subtle-field, .flag-row, .keymap-row, .bg-layer-tab, .subtle-field-full, .track-mix-controls, .announce-row');
  active.classList.toggle('cols-1', fields.length <= 6);
  active.classList.toggle('cols-2', fields.length > 6);
}

// ===== APLICAR COLORES =====
export function applySettingsBg() {
  document.getElementById('drawer').style.background = CFG.settingsBgColor;
}

export function applyPanelColor() {
  document.documentElement.style.setProperty('--bg-panel-2', CFG.panelColor);
}

// ===== HARMONIZE =====
function findHarmonizeSource() {
  const withImage = CFG.background.layers.find(l => l.file && l.type !== 'video');
  return withImage ? withImage.file : null;
}

// ===== DIFICULTAD =====
export function applyDifficultyLevel() {
  const preset = CFG.difficultyPresets && CFG.difficultyPresets[CFG.difficultyLevel];
  if (!preset) return;
  if (preset.keyRange) {
    window.keyboardRange = { lo: preset.keyRange[0], hi: preset.keyRange[1] };
    applyKeyboardRange();
  }
  if (preset.speed) {
    CFG.tempo = preset.speed;
    setTempoValue(Math.round(preset.speed * 100));
  }
  if (preset.lookahead && window.LOOKAHEAD) {
    window.LOOKAHEAD = preset.lookahead;
  }
  if (typeof preset.showBeatLines !== 'undefined') {
    CFG.flags.showBeatLines.value = preset.showBeatLines;
    buildFlagsPanel();
    applyFlags();
  }
  if (typeof preset.autoHideMouse !== 'undefined') {
    CFG.flags.autoHideMouse.value = preset.autoHideMouse;
    buildFlagsPanel();
    applyFlags();
  }
  saveConfig();
}

// ===== HARMONIZE =====
function harmonizeWithImage() {
  const src = findHarmonizeSource();
  if (!src) return;
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 32;
    const cx = c.getContext('2d');
    cx.drawImage(img, 0, 0, 32, 32);
    let r = 0,
      g = 0,
      b = 0,
      n = 0;
    const data = cx.getImageData(0, 0, 32, 32).data;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
    r = Math.round(r / n);
    g = Math.round(g / n);
    b = Math.round(b / n);
    const boost = c2 => Math.min(255, Math.round(c2 * 1.35 + 30));
    const hex = '#' + [boost(r), boost(g), boost(b)].map(v => v.toString(16).padStart(2, '0')).join('');
    const theme = {
      accent: hex,
      accentSoft: hex,
      noteWhite: `${boost(r)},${boost(g)},${boost(b)}`,
      noteBlack: `${r},${g},${b}`,
      played: '111,191,115'
    };
    THEMES.custom = theme;
    CFG.colorTheme = 'custom';
    CFG.customTheme = theme;
    document.getElementById('customThemeOption').style.display = '';
    document.getElementById('colorThemeSelect').value = 'custom';
    applyColorTheme();

    const palette = [];
    for (let i = 0; i < 7; i++) {
      const f = 0.35 + (i / 6) * 1.15;
      const pr = Math.min(255, Math.round(r * f)),
        pg = Math.min(255, Math.round(g * f)),
        pb = Math.min(255, Math.round(b * f));
      palette.push('#' + [pr, pg, pb].map(v => v.toString(16).padStart(2, '0')).join(''));
    }
    CFG.harmonizePalette = palette;

    const panelHex = '#' + [Math.round(r * 0.55 + 8), Math.round(g * 0.5 + 8), Math.round(b * 0.6 + 12)].map(v => Math.min(255, v).toString(16).padStart(2, '0')).join('');
    CFG.panelColor = panelHex;
    document.getElementById('panelColorInput').value = panelHex;
    applyPanelColor();

    saveConfig();
    window.showToast(t('harmonizeDone'));
  };
  img.src = src;
}

// ===== MODE TABS (Option C) =====
// The Free/View/Practice tabs live at the top of the drawer (#modeTabs) and when
// changing mode they highlight the active one and filter the settings groups according to
// data-modes. Los grupos sin data-modes son compartidos (siempre visibles).
const MODE_TABS = [
  { mode: 'free', icon: '🎹', labelKey: 'modeFree' },
  { mode: 'watch', icon: '👁', labelKey: 'modeWatch' },
  { mode: 'practice', icon: '🎯', labelKey: 'modePractice' }
];

export function applyModeFilter(mode) {
  // En el layout dinámico se muestran TODAS las opciones sin importar el modo
  // (el usuario quiere ver todo de una). No filtramos por data-modes ahí.
  if (CFG.drawerLayout === 'dynamic') {
    document.querySelectorAll('.settings-group[data-modes]').forEach(g => g.classList.remove('hidden-by-mode'));
    return;
  }
  document.querySelectorAll('.settings-group[data-modes]').forEach(g => {
    const modes = (g.dataset.modes || '').split(',').map(s => s.trim());
    const show = modes.includes(mode);
    g.classList.toggle('hidden-by-mode', !show);
  });
}

export function buildModeTabs() {
  const container = document.getElementById('modeTabs');
  if (!container) return;
  container.innerHTML = '';
  const current = window.appMode || 'free';
  MODE_TABS.forEach(({ mode, icon, labelKey }) => {
    const btn = document.createElement('button');
    btn.className = 'mode-tab' + (mode === current ? ' active-mode' : '');
    btn.dataset.modeTab = mode;
    btn.innerHTML = `<span class="mode-icon">${icon}</span><span>${t(labelKey)}</span>`;
    btn.addEventListener('click', () => {
      if (window.appMode === mode) return;
      window.appMode = mode;
      applyMode(mode);
      container.querySelectorAll('.mode-tab').forEach(t => t.classList.toggle('active-mode', t.dataset.modeTab === mode));
      applyModeFilter(mode);
    });
    container.appendChild(btn);
  });
  applyModeFilter(current);
}