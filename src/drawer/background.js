// ============================================================
// src/drawer/background.js - Color de fondo y capas de imagen/video
//
// Extraído de drawer.js. bgLayerActive es estado interno de este módulo: antes
// era un `let` suelto en drawer.js y sólo lo usaban estas dos funciones.
// ============================================================

import { CFG, saveConfig } from '../config.js';
import { t } from '../i18.js';

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
