// ============================================================
// src/drawer/layout.js - Cómo se presenta el panel y qué grupos se ven
//
// Extraído de drawer.js. Reúne las tres cosas que dependen de CFG.drawerLayout
// (sidebar / dynamic / fullscreen) más las pestañas de modo, porque comparten
// una única regla: qué se muestra según el modo y el layout activos.
// ============================================================

import { CFG } from '../config.js';
import { t } from '../i18.js';
import { resizeCanvases } from '../ui/canvas.js';
import { appMode, applyMode } from '../controls/playback.js';

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
  if (CFG.drawerLayout === 'sidebar' && resizeCanvases) {
    setTimeout(() => resizeCanvases?.(), 280);
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

// ===== APPLY DESIGN =====
export function applyDrawerLayout() {
  document.body.classList.toggle('layout-sidebar', CFG.drawerLayout === 'sidebar');
  document.body.classList.toggle('layout-dynamic', CFG.drawerLayout === 'dynamic');
  // Tema de interfaz (classic por defecto | concerthall rediseño)
  if (CFG.uiTheme && CFG.uiTheme !== 'classic') {
    document.body.setAttribute('data-theme', CFG.uiTheme);
  } else {
    document.body.removeAttribute('data-theme');
  }
  // Forzar height limpio al cambiar de layout (evita bugs de scroll/overflow)
  const drawer = document.getElementById('drawer');
  if (drawer) {
    drawer.style.height = CFG.drawerLayout === 'sidebar' ? '100%' : '';
  }
  applyGroupDefaults();
  // Re-evaluar el filtro por modo: en layout dinámico se muestran TODAS las
  // opciones sin importar el modo activo (limpia cualquier hidden-by-mode).
  applyModeFilter(appMode || 'watch');
  // Keep the layout <select> in sync with the actual config so the displayed
  // option matches CFG (otherwise the browser shows the first option while
  // the real layout is different, forcing the user to change it twice).
  const layoutSel = document.getElementById('drawerLayoutSelect');
  if (layoutSel) layoutSel.value = CFG.drawerLayout;
  const langSel = document.getElementById('langSelect');
  if (langSel) langSel.value = CFG.language || 'es';
  const uiThemeSel = document.getElementById('uiThemeSelect');
  if (uiThemeSel) uiThemeSel.value = CFG.uiTheme || 'classic';
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
  const current = appMode || 'free';
  MODE_TABS.forEach(({ mode, icon, labelKey }) => {
    const btn = document.createElement('button');
    btn.className = 'mode-tab' + (mode === current ? ' active-mode' : '');
    btn.dataset.modeTab = mode;
    btn.innerHTML = `<span class="mode-icon">${icon}</span><span>${t(labelKey)}</span>`;
    btn.addEventListener('click', () => {
      if (appMode === mode) return;
      applyMode(mode);
      container.querySelectorAll('.mode-tab').forEach(t => t.classList.toggle('active-mode', t.dataset.modeTab === mode));
      applyModeFilter(mode);
    });
    container.appendChild(btn);
  });
  applyModeFilter(current);
}
