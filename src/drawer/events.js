// ============================================================
// src/drawer/events.js - Enlaces de los controles del panel
//
// Extraído de drawer.js, donde initDrawerEvents() eran 360 líneas y un solo
// `addEventListener` por control: decenas de getElementById en bloque, sin forma
// de saber qué hacía cada trozo sin leerlo entero.
//
// Se parte por dominio. El nombre público initDrawerEvents() se conserva porque
// main.js lo llama desde safeStep('eventos'), y porque los sub-bloques se
// registran en grupos en vez de en el orden original del fichero. No cambia nada
// observable: cada listener se ata a un elemento distinto y ninguno lee un valor
// que otro liste al registrarse.
// ============================================================

import { CFG, saveConfig, STORAGE_KEY } from '../config.js';
import { t, applyI18n } from '../i18.js';
import { applyKeyboardRange } from '../ui/keys.js';
import { showToast } from '../controls/playback.js';
import {
  setEqPreset,
  analyzeAndOptimizeMidi,
  eqLow,
  eqMid,
  eqHigh,
  setSampleBuffer
} from '../audio.js';
import { initReportButton } from '../report.js';
import { setButtonsForceVisible } from './controls-vis.js';
import { applyColorTheme, applySettingsBg, applyPanelColor, harmonizeWithImage } from './themes.js';
import { applyBackground } from './background.js';
import { applyDrawerLayout, setDrawerOpen, buildModeTabs } from './layout.js';
import { applyDifficultyLevel, syncAdvancedSettingsUI } from './difficulty.js';

// Apertura, cierre, acordeón de categorías y reparto de foco en layout sidebar.
function initDrawerChromeEvents() {
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
      // En panel lateral: solo una categoría abierta a la vez. Al abrir una,
      // cerramos las demás (excepto la propia). En fullscreen/dynamic cada una
      // conserva su estado independiente.
      if (willOpen && document.body.classList.contains('layout-sidebar')) {
        document.querySelectorAll('.settings-group.open').forEach(other => {
          if (other !== group) {
            other.classList.remove('open');
            // Si cerramos la de asignación de teclas, restauramos su estado.
            if (other.dataset.group === 'buttons') {
              if (buttonsPrevKeyCount != null) {
                CFG.visibleKeyCount = buttonsPrevKeyCount;
                buttonsPrevKeyCount = null;
              }
              setButtonsForceVisible(false);
              if (applyKeyboardRange) applyKeyboardRange();
            }
          }
        });
      }
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
        if (applyKeyboardRange) applyKeyboardRange();
      }
    });
  });

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

// Idioma, layout, temas, colores, perfiles de tecla, avisos y anuncios.
function initDrawerAppearanceEvents() {
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
  document.getElementById('uiThemeSelect')?.addEventListener('change', e => {
    CFG.uiTheme = e.target.value;
    applyDrawerLayout(); // aplica data-theme en vivo
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
}

// Acciones que tocan configuración: harmonize, reporte, reset y análisis MIDI.
function initDrawerActionEvents() {
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
}

// Sintetizador, samples, metrónomo, EQ, graves y audio realista.
function initDrawerAudioEvents() {
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
        setSampleBuffer(buf);
        showToast(t('sampleLoaded') + file.name);
      }, () => { showToast(t('sampleDecodeError')); });
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

// EQ. Los nodos del grafo son live bindings de audio.js: antes esto leía
  // window.eqLow, que main.js sólo publicaba tras el primer gesto, así que
  // mover un slider antes de ese gesto no tocaba nada.
  document.getElementById('eqLowInput')?.addEventListener('input', e => {
    CFG.eq.low = +e.target.value;
    if (eqLow) eqLow.gain.value = CFG.eq.low;
    document.getElementById('eqLowVal').textContent = e.target.value + 'dB';
    saveConfig();
  });
  document.getElementById('eqMidInput')?.addEventListener('input', e => {
    CFG.eq.mid = +e.target.value;
    if (eqMid) eqMid.gain.value = CFG.eq.mid;
    document.getElementById('eqMidVal').textContent = e.target.value + 'dB';
    saveConfig();
  });
  document.getElementById('eqHighInput')?.addEventListener('input', e => {
    CFG.eq.high = +e.target.value;
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
}

// Humanize, swing, ratón, dificultad, perspectiva, pulso, cámara y acordes.
function initDrawerPracticeEvents() {
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
}

export function initDrawerEvents() {
  initDrawerChromeEvents();
  initDrawerAppearanceEvents();
  initDrawerActionEvents();
  initDrawerAudioEvents();
  initDrawerPracticeEvents();
  syncAdvancedSettingsUI();
  buildModeTabs();
}
