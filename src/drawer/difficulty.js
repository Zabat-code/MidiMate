// ============================================================
// src/drawer/difficulty.js - Presets de dificultad
//
// Extraído de drawer.js. applyDifficultyLevel toca a la vez teclado, tempo,
// cámara y flags, así que es el punto donde convergen cinco módulos. El orden
// importa: el rango de teclas y el lookahead se aplican antes que los flags,
// porque applyFlags() redibuja los canvas.
// ============================================================

import { CFG, saveConfig } from '../config.js';
import { applyKeyboardRange, setKeyboardRange } from '../ui/keys.js';
import { setTempoValue } from '../controls/transport.js';
import { setLookahead } from '../ui/roll.js';
import { buildFlagsPanel, applyFlags } from './flags.js';

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

// ===== DIFICULTAD =====
export function applyDifficultyLevel() {
  const preset = CFG.difficultyPresets && CFG.difficultyPresets[CFG.difficultyLevel];
  if (!preset) return;
  if (preset.keyRange) {
    setKeyboardRange(preset.keyRange[0], preset.keyRange[1]);
    applyKeyboardRange();
  }
  if (preset.speed) {
    CFG.tempo = preset.speed;
    setTempoValue(Math.round(preset.speed * 100));
  }
  if (preset.lookahead) {
    setLookahead(preset.lookahead);
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
