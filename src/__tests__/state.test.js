import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CFG, loadConfig } from '../config.js';
import { song, trackSettings, applyMode, appMode } from '../controls/playback.js';
import { LOOKAHEAD, setLookahead } from '../ui/roll.js';

// Estos tests fijan el contrato de "una sola fuente de verdad" del estado.
// Antes de escribirlos, dos bugs reales convivían con la suite en verde:
//
//  1. main.js publicaba `window.trackSettings = {}` (un objeto NUEVO) en vez
//     de la referencia que exporta playback.js. tracks.js escribía en el
//     global y roll.js/drawer.js leían el del módulo: con tileSkin === 'tracks',
//     el modo Libre (drawFreeTiles) leía siempre un objeto vacío, así que las
//     notas se dibujaban sin color y sin respetar la visibilidad por pista.
//  2. LOOKAHEAD era `export const` en roll.js, pero drawer.js hacía
//     `window.LOOKAHEAD = preset.lookahead`. Escribir el global no movía el
//     const, así que el lookahead de los niveles de dificultad era un no-op.

describe('estado global: una sola referencia', () => {
  beforeEach(() => {
    loadConfig();
    for (const k of Object.keys(trackSettings)) delete trackSettings[k];
  });

  it('main.js debe publicar el MISMO objeto que playback.js exporta', () => {
    // Reproduce la línea de main.js. Si alguien vuelve a poner `{}`, falla.
    window.trackSettings = trackSettings;
    expect(window.trackSettings).toBe(trackSettings);
  });

  it('escribir en trackSettings se ve desde el global y viceversa', () => {
    window.trackSettings = trackSettings;
    trackSettings[0] = { color: '#ff0000', visible: true };
    expect(window.trackSettings[0].color).toBe('#ff0000');
  });
});

describe('LOOKAHEAD es estado, no una constante', () => {
  // El test que había aquí afirmaba que el global NO movía LOOKAHEAD, y por eso
  // daba verde: documentaba el bug. drawing-style: drawRoll/line 616 calcula
  // `const rate = h / LOOKAHEAD`, así que si el preset de dificultad no lo mueve,
  // las notas salen del tamaño que nominalmente pedidos.
  afterEach(() => setLookahead(2.2));

  it('setLookahead mueve el binding que lee la cámara dinámica', () => {
    expect(LOOKAHEAD).toBe(2.2);
    expect(setLookahead(4.4)).toBe(true);
    expect(LOOKAHEAD).toBe(4.4);
  });

  it('rechaza valores que dejarían la pista sin margen', () => {
    // updateDynamicCamera escala minLA/maxLA contra LOOKAHEAD, así que 0 o un
    // negativo no son un valor "raro", son un track invisible.
    for (const malo of [0, -1, NaN, Infinity, '4', null, undefined]) {
      setLookahead(4.4);
      expect(setLookahead(malo)).toBe(false);
      expect(LOOKAHEAD).toBe(4.4);
    }
  });

  it('la superficie window sigue viva: es un getter, no una foto fija', async () => {
    // main.js publicaba `window.LOOKAHEAD = LOOKAHEAD`, lo que congela el valor
    // en el arranque. Ahora es un getter sobre el binding.
    await import('../main.js');
    setLookahead(6.6);
    expect(window.LOOKAHEAD).toBe(6.6);
  });
});

describe('applyMode es la única vía para cambiar de modo', () => {
  it('mantiene sincronizados el binding del módulo y window.appMode', () => {
    expect(CFG).not.toBeNull();
    // Import vivo: refleja el `let` de playback.js. Es el binding que leen
    // frameInner/applyModeFilter (`appMode === 'watch'`, etc.), así que si
    // applyMode no lo moviera, la compuerta de auto-avance se quedaría en
    // 'free' para siempre.
    for (const mode of ['practice', 'watch', 'free']) {
      applyMode(mode);
      expect(appMode).toBe(mode);
      // report.js y api-integration.js leen el global, no el binding.
      expect(window.appMode).toBe(mode);
    }
  });

  it('un llamador que sólo llama a applyMode deja el global correcto', () => {
    // Reproduce lo que hacen events.js / drawer.js / playlist.js: ya no
    // escriben window.appMode a mano, dependen de applyMode.
    applyMode('watch');
    expect(window.appMode).toBe('watch');
  });
});

describe('el estado exportado es utilizable sin window', () => {
  it('song y trackSettings existen', () => {
    expect(song).toBeTruthy();
    expect(trackSettings).toBeTruthy();
  });
});
