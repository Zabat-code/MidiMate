import { describe, it, expect, vi, beforeAll } from 'vitest';

// provenance: este fichero se reconstruyó tras vaciarse por un error de
// escritura. El test de ciclos/TDZ es el original; la guarda de globals y las
// comprobaciones de superficie se añadieron después, al reconstruir main.js.

describe('arranque de la app', () => {
  it('importar main.js no lanza errores de ciclo ni TDZ', async () => {
    // El grafo de módulos es circular por diseño (playback <-> keyboard, y
    // varios módulos pasan por drawer). Con ESM, un orden de evaluación malo
    // produce "Cannot access 'X' before initialization" en vez de un fallo de
    // sintaxis, así que hay que mirar lo que se registró al importar.
    const errores = [];
    const origError = console.error;
    const origWarn = console.warn;
    console.error = (...a) => { errores.push(a.map(String).join(' ')); };
    console.warn = (...a) => { errores.push(a.map(String).join(' ')); };

    try {
      await import('../main.js');
    } finally {
      console.error = origError;
      console.warn = origWarn;
    }

    const cycles = errores.filter(e => /before initialization|Cannot access/.test(e));
    expect(cycles).toEqual([]);
  });

  it('ningún safeStep del arranque falla', async () => {
    // init() está pensado para que un panel roto no tumbe la app: cada paso va
    // en try/catch y se avisa. Si algún paso falla, el aviso sale por
    // showToast, así que se vigila el log de error que safeStep emite.
    const errores = [];
    const origError = console.error;
    console.error = (...a) => { errores.push(a.map(String).join(' ')); };

    try {
      await import('../main.js');
    } finally {
      console.error = origError;
    }

    const pasos = errores.filter(e => /Falló el paso de inicio/.test(e));
    expect(pasos).toEqual([]);
  });

  it('el arranque rehidrata trackSettings desde la configuración guardada', async () => {
    // CFG.trackSettings se escribía al guardar pero nunca se volvía a leer:
    // la mezcla por pista se perdía al recargar. Guarda de la línea que lo fija.
    const fuente = (await import('../main.js?raw')).default.replace(/\r/g, '');
    expect(fuente).toMatch(/Object\.assign\(trackSettings,\s*CFG\.trackSettings\s*\|\|\s*\{\}\)/);
  });
});

describe('superficie pública de window', () => {
  beforeAll(async () => {
    await import('../main.js');
  });

  it('publica lo que api-integration.js y el reporte necesitan', () => {
    // Esta lista no es decorativa: son los siete globals que api-integration.js
    // lee, más el estado que el monolito y ?api=1 tocan por fuera. Si uno falta,
    // la integración externa se rompe en silencio.
    const requeridos = [
      'appMode', 'handleNoteOff', 'handleNoteOn', 'setPlaybackState',
      'showToast', 'song', 'CFG', 'saveConfig', 'midimateAPI',
      'initAPIIntegration', 'applyMode', 'frame', 'startPlaybackLoop',
    ];
    const faltan = requeridos.filter(n => window[n] === undefined);
    expect(faltan).toEqual([]);
  });

  it('el estado publicado es la MISMA referencia que el store', () => {
    // Si main.js volviera a publicar `{}` en vez de la referencia, volvería el
    // bug de trackSettings: los módulos leen un objeto y main.js publica otro.
    return import('../song-state.js').then(({ song, trackSettings }) => {
      expect(window.song).toBe(song);
      expect(window.trackSettings).toBe(trackSettings);
    });
  });
});

describe('todo global de la app está publicado', () => {
  it('ningún módulo lee un window.X que no exista', async () => {
    await import('../main.js');

    const NAVEGADOR = new Set([
      'addEventListener', 'removeEventListener', 'innerWidth', 'innerHeight',
      'devicePixelRatio', 'requestAnimationFrame', 'cancelAnimationFrame',
      'localStorage', 'sessionStorage', 'AudioContext', 'webkitAudioContext',
      'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
      'matchMedia', 'scrollTo', 'getComputedStyle', 'performance', 'document',
      'open', 'location', 'navigator', 'fetch', 'crypto', 'URL', 'Blob',
      'FileReader', 'Image', 'Event', 'CustomEvent', 'alert', 'confirm',
      'prompt', 'getSelection', 'visualViewport', 'screen', 'history',
      'MediaRecorder', 'MediaStream', 'SpeechSynthesisUtterance', 'PointerEvent',
      'HTMLElement', 'HTMLAnchorElement', 'Node', 'CSS', 'frames', 'parent',
      'top', 'self', 'name', 'status', 'speechSynthesis', 'Audio'
    ]);

    const modulos = import.meta.glob('../**/*.js');
    const rotos = [];
    for (const ruta of Object.keys(modulos)) {
      if (ruta.includes('__tests__')) continue;
      const fuente = (await import(ruta + '?raw')).default;
      // Ojo con los \r: varios módulos están en CRLF, y el ancla $ de una regex
      // no casa antes de un \r, así que los comentarios de línea no se quitaban
      // y el test señalaba sus propios comentarios como globals colgando.
      const lineas = fuente.replace(/\r/g, '').split('\n');
      lineas.forEach((linea, i) => {
        // Se ignoran comentarios: explican de dónde vino cada cosa.
        const limpio = linea.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
        for (const m of limpio.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)/g)) {
          const nombre = m[1];
          if (NAVEGADOR.has(nombre)) continue;
          // Una escritura crea el global, no lo consume: no puede fallar.
          if (new RegExp(`\\bwindow\\.${nombre}\\s*(=[^=]|\\?\\?=|\\|\\|=|&&=)`).test(limpio)) continue;
          if (window[nombre] === undefined) {
            rotos.push(`${ruta}:${i + 1}  window.${nombre}`);
          }
        }
      });
    }
    expect(rotos).toEqual([]);
  });
});

// Segunda guarda arquitectónica, y la que habría cazado los dos últimos bugs.
//
// Un módulo puede leer un global sin escribir `window.`: basta con usar el
// identificador a pelo, y se resuelve por el ámbito global. Funciona mientras
// main.js lo publique, así que no se rompe al compilar: se rompe en runtime, en
// silencio, y sólo en la functionality concreta que lo usaba. Pasó con eqLow/eqMid/eqHigh
// (import perdido al editar) y con setTempoValue (nunca importado).
describe('ningún módulo depende de un global publicado sin importarlo', () => {
  it('los identificadores globales se importan o se declaran en el módulo', async () => {
    const fuenteMain = (await import('../main.js?raw')).default;

    // 1. La superficie que main.js publica.
    const publicados = new Set(
      [...fuenteMain.replace(/\r/g, '').matchAll(/^window\.([A-Za-z_$][\w$]*)\s*=/gm)]
        .map(m => m[1])
    );

    // 2. Por cada módulo, lo que declara e importa.
    const modulos = import.meta.glob('../**/*.js');
    const problemas = [];
    for (const ruta of Object.keys(modulos)) {
      // Hay tests en src/ raíz además de src/__tests__/. main.js entra: lo
      // que leía a pelo era justo `playlist`, que al minificar dejó de
      // resolver. Excluirlo de la guarda era justo lo que tapaba el fallo.
      if (ruta.includes('__tests__') || ruta.includes('.test.js')) continue;
      const crudo = (await import(ruta + '?raw')).default.replace(/\r/g, '');

      const importados = new Set();
      for (const m of crudo.matchAll(/import\s*\{([^}]*)\}\s*from/g)) {
        for (const p of m[1].split(',')) importados.add(p.trim().split(/\s+as\s+/).pop().trim());
      }
      // Se descartan comentarios y strings para no leer el código dentro de
      // ellos; y las claves de objeto (`playlist: 'x'`) no son referencias.
      const codigo = crudo
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ')
        .replace(/'(?:\\.|[^'\\])*'/g, "''")
        .replace(/"(?:\\.|[^"\\])*"/g, '""')
        .replace(/`(?:\\.|[^`\\])*`/g, '``');
      // Sin ancla antes de la palabra clave: `for (let t = 0; ...)` también
      // declara, y con el ancla se le escapaba y daba falso positivo.
      const declarados = new Set(
        [...codigo.matchAll(/\b(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)]
          .map(m => m[1])
      );

      for (const nombre of publicados) {
        if (importados.has(nombre) || declarados.has(nombre)) continue;
        // Referencia a pelo: no puede ir precedida de . y no puede ser clave.
        const re = new RegExp(`(?<![.\\w$])${nombre}\\b(?!\\s*:)`, 'g');
        const linea = codigo.slice(0, re.exec(codigo)?.index ?? -1).split('\n').length;
        if (re.test(codigo)) problemas.push(`${ruta}:${linea}  ${nombre}`);
      }
    }
    expect(problemas).toEqual([]);
  });
});
