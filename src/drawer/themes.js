// ============================================================
// src/drawer/themes.js - Temas de color, colores del panel y "harmonize"
//
// Extraído de drawer.js. El tema vive en THEMES, y CFG.colorTheme dice cuál
// está activo. currentTheme() es lo que leen roll.js, keys.js y staff.js para
// pintar, así que no puede quedar escondido tras un listener.
// ============================================================

import { CFG, saveConfig } from '../config.js';
import { t } from '../i18.js';
import { showToast } from '../controls/playback.js';

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

// ===== APLICAR COLORES =====
export function applySettingsBg() {
  const drawer = document.getElementById('drawer');
  drawer.style.background = CFG.settingsBgColor;
  /* Misma tinta que MidiMate-web: se calcula desde el fondo real del panel para
     que los títulos de grupo con color no choquen con ningún tema. */
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((CFG.settingsBgColor || '').trim());
  let lum = 0;
  if (m){
    let h = m[1];
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const lin = [0, 2, 4].map(i => {
      const v = parseInt(h.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    lum = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  }
  drawer.style.setProperty('--group-ink', lum > 0.45 ? '#2E2822' : '#F3ECDC');
  drawer.style.setProperty('--group-mix', lum > 0.45 ? '40%' : '64%');
}

export function applyPanelColor() {
  document.documentElement.style.setProperty('--bg-panel-2', CFG.panelColor);
}

// ===== HARMONIZE =====
function findHarmonizeSource() {
  const withImage = CFG.background.layers.find(l => l.file && l.type !== 'video');
  return withImage ? withImage.file : null;
}

// ===== HARMONIZE =====
export function harmonizeWithImage() {
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
    showToast(t('harmonizeDone'));
  };
  img.src = src;
}
