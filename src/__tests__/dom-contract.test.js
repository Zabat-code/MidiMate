import { describe, it, expect } from 'vitest';

// Contrato entre el HTML y el código. Se añadió al partir drawer.js en siete
// módulos: al mover bloques de código a pelo, un id mal escrito no da error de
// sintaxis, el `?.addEventListener` simplemente no ata nada y el control aparece
// muerto sin que ninguna otra señal lo delate. En el DOM de happy-dom esto es
// aún más silencioso, porque la mayoría de elementos ni siquiera existen.
describe('contrato DOM <-> código', () => {
  it('todo getElementById del código existe en index.html o lo crea el propio módulo', async () => {
    const html = await import('../../index.html?raw').then(m => m.default);
    const enHtml = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));

    const modulos = import.meta.glob('../**/*.js');
    const huerfanos = [];

    for (const ruta of Object.keys(modulos)) {
      if (ruta.includes('__tests__') || ruta.includes('.test.js')) continue;
      const fuente = (await import(ruta + '?raw')).default.replace(/\r/g, '');

      // Ids que este mismo módulo inyecta en el DOM. Por ejemplo tracks.js crea
      // #keepAllPresetToggle con insertAdjacentHTML y lo busca acto seguido.
      const idsPropios = new Set(
        [...fuente.matchAll(/\bid="([^"]+)"/g)].map(m => m[1])
      );

      for (const m of fuente.matchAll(/getElementById\('([^']+)'\)/g)) {
        const id = m[1];
        if (enHtml.has(id) || idsPropios.has(id)) continue;
        const linea = fuente.slice(0, m.index).split('\n').length;
        huerfanos.push(`${ruta}:${linea}  #${id}`);
      }
    }

    expect(huerfanos).toEqual([]);
  });

  it('el HTML declara todos los data-ctrl que usa la visibilidad de controles', async () => {
    // applyControlVisibility() recorre [data-ctrl] y lee CFG.controlVisibility.
    // Si el HTML gana un botón con data-ctrl y nadie lo mete en CTRL_META, el
    // usuario no tiene forma de ocultarlo y no hay error en ninguna parte.
    const html = await import('../../index.html?raw').then(m => m.default);
    const enHtml = new Set(
      [...html.matchAll(/data-ctrl="([^"]+)"/g)].map(m => m[1])
    );
    const { CTRL_META } = await import('../drawer/controls-vis.js');
    const huerfanos = [...enHtml].filter(id => !(id in CTRL_META));

    expect(huerfanos).toEqual([]);
  });
});
