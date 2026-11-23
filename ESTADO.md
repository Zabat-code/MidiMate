# Midimate — estado del trabajo

Autorreferencia de lo hecho en `src/`, de los bugs encontrados y de lo que
queda. Actualizado 2026-09-28. Para lo de Midiforja, ver
`../Midiforja/REVISION_MIDIFORJA.md`; para el single-file, `../MidiMate-web/README.md`.

> Actualización 2026-11-23: se eliminó la integración con Midiforja (botón
> "Conectar a Midiforja API", cliente REST/WebSocket y bridge). Midiforja no
> forma parte del paquete y la conexión no funcionaba. Las menciones
> anteriores a la integración son históricas.

App de piano en Vite (JS a pelo, sin framework) con Vitest. 9170 líneas en 48
ficheros, 58 tests en 10 ficheros, build en verde.

---

## 1. Qué se hizo

### Partir los dos ficheros que se comían el proyecto

**`drawer.js`, 1000 líneas → 7 módulos** en `src/drawer/`. Antes era un panel de
ajustes con seis responsabilidades y un `initDrawerEvents` de 360 líneas:

| módulo | líneas | qué lleva |
|---|---|---|
| `themes.js` | 113 | temas de color, colores del panel, "harmonize" |
| `flags.js` | 79 | flags booleanos y su panel |
| `controls-vis.js` | 64 | qué controles de la barra se ven |
| `background.js` | 191 | color de fondo y capas de imagen/video |
| `layout.js` | 178 | sidebar/dynamic, acordeón, pestañas de modo |
| `difficulty.js` | 67 | presets de dificultad |
| `events.js` | 410 | los enlaces de todo lo anterior, en 5 funciones por dominio |

`src/controls/drawer.js` se usó como barril para no romper los siete
importadores de golpe, y se borró después: ahora cada uno importa directo del
módulo que necesita. `initDrawerEvents` se partió en `initDrawerChromeEvents`,
`initDrawerAppearanceEvents`, `initDrawerActionEvents`, `initDrawerAudioEvents`
e `initDrawerPracticeEvents`. Se registran agrupadas en vez de en el orden
original del fichero; no cambia nada observable porque cada listener se ata a un
elemento distinto y ninguno lee un valor que otro liste al registrarse.

**`audio.js`, 771 líneas → fachada de 239 + 6 módulos** en `src/synth/`.
`makeVoice` eran 345 líneas con cuatro responsabilidades atadas (decidir de
dónde sale el sonido, sintetizar, montar efectos, envolver en un objeto con su
`stop()`):

| módulo | líneas | qué lleva |
|---|---|---|
| `context.js` | 114 | AudioContext lazy, grafo maestro, mapas de voces |
| `buffers.js` | 140 | buffers, `noteToFreq`, muestras realistas |
| `voice-source.js` | 38 | de dónde sale el sonido de una nota |
| `voice-synth.js` | 237 | los 27 presets |
| `voice-effects.js` | 49 | cadena de efectos por pista |
| `voice.js` | 69 | `makeVoice()`, que los encadena |

Se partió así, y no con un módulo por synth, para no dejar un `audio.js` de 700
líneas con un tropezón dentro. `audio.js` se quedó como fachada: conserva los
ciclos de vida de voces, metrónomo, selector de nota base, presets de EQ y
análisis MIDI, y reexporta el resto para que `window.makeVoice`, `window.actx` y
los demás sigan siendo los mismos objetos.

### Estado y globals

- Estado de canción a `song-state.js`; lista e índice a `playlist-store.js`;
  `toast.js` desacoplado.
- `keyboard.js` quedó sin globals de app.
- `main.js` reconstruido desde el último bundle bueno y contrastado con el
  monolito: 118 publicaciones del bundle + `midimateAPI` e `initAPIIntegration`.
  App globals: 412 → 181. Las que quedan son superficie pública deliberada.
- `LOOKAHEAD` pasó de constante a `export let` con `setLookahead()` y validación.
  `main.js` lo publica con un getter vivo.
- `setKeymapPanelBuilder(buildKeymapPanel)` se registra desde `main.js`, que es
  donde ya conviven `keyboard.js` y el drawer, para no cerrar un ciclo.

---

## 2. Los bugs

Todos estos estaban en producción y **no los cazaba ningún test**, porque los
tests corren contra el código sin minificar y ahí el síntoma es invisible. Cada
guarda que hay en `boot.test.js` existe porque antes cayó algo de este tipo.

### `config.js` — la persistencia estaba muerta
`saveConfig()` leía `playlist` sin importarlo. `ReferenceError` en la primera
línea, `localStorage.setItem` nunca se ejecutaba. **Nada se guardaba.** Además
`saveTimer` era `window._saveTimer`.

### `audio.js` — la muestra recién subida no sonaba
El handler de subida asignaba `window.sampleBuffer`, que es un binding distinto
del que lee `makeVoice`. Una muestra recién cargada no se oía hasta recargar la
página, momento en que `restoreSampleFromConfig` la cargaba desde `CFG`. Además
`sampleBuffer` se reasignaba desde otro módulo, lo cual es ilegal en ESM. Ahora
hay un `setSampleBuffer()` y es el único camino para cambiarla en caliente.

### `audio.js` — el `if (isSample)` de la cadena de efectos tenía dos ramas idénticas
Salvo por el nodo de entrada. Sustituido por un parámetro `input`.

### `drawer.js` — la EQ leía `window.eqLow` antes de existir
`main.js` publica los nodos de EQ tras el primer gesto del usuario, así que
mover un slider antes de ese gesto no tocaba nada. Ahora `drawer.js` importa
`eqLow`, `eqMid`, `eqHigh` como live bindings de `audio.js`.

### `drawer.js` / `playback.js` — identificadores a pelo
`setTempoValue` nunca importado; `showToast` sí usado pero no importado en
`playback.js`. Los dos rompían en runtime alCompilar.

### `main.js` — `playlist` sin importar (el que más costó ver)
`main.js:450` leía `playlist` y `currentPlaylistIndex` como identificadores a
pelo. En dev funcionaba porque `window.playlist` está publicado; al minificar,
esbuild renombra el binding del store y la referencia se queda sin resolver →
`ReferenceError` en runtime, sólo en el arranque. **Lo destapó generar el
single-file y abrirlo en Chrome.** La guarda arquitectónica de `boot.test.js`
tenía un `continue` que excluía `main.js` de la comprobación, que es justo donde
estaba el bug. Quitado.

### `main.js` — `populateSampleBaseNoteSelect()` nunca se llamaba
Se importaba y se publicaba en `window`, pero no se invocaba en ningún sitio: el
selector de nota base se quedaba vacío y el usuario no podía elegir con qué nota
suena la muestra subida. El monolito viejo sí lo llamaba al arrancar. Sólo se
vio comparando el DOM de ambos. Un barrido de funciones exportadas que nadie
llama no encontró más de este tipo.

### `index.html` — el botón de API no se podía ocultar
Tenía `data-ctrl="connectApi"` pero faltaba en `CTRL_META` y en `i18.js`. Era el
único control de la barra sin su interruptor en el panel de visibilidad. Añadido
en las tres capas.

---

## 3. Las guardas que quedaron

Cada una existe porque cayó algo de lo de arriba, y se verificó que fallan
quitando el import que vigilan:

- **`dom-contract.test.js`** — todo `getElementById` del código existe en
  `index.html` o lo crea su propio módulo, y ningún `data-ctrl` queda fuera de
  `CTRL_META`. Esto importa especialmente: un id mal escrito no da error de
  sintaxis, el `?.addEventListener` no ata nada y el control aparece muerto sin
  que ninguna otra señal lo delate.
- **`boot.test.js`: ningún módulo lee un `window.X` inexistente.**
- **`boot.test.js`: ningún módulo usa un global publicado como identificador
  desnudo sin importarlo o declararlo.** Ahora incluye `main.js`.

---

## 4. Lo que falta

**El punto ciego real:** las 27 recetas de `voice-synth.js` no tienen test. El
resto de `src/` está razonablemente cubierto porque los tests son posteriores a
los bugs, pero ese bloque grande no. Es candidato natural a tabla de datos y se
dejó como `if/else` **a propósito**: los tests cubren la conectividad del grafo,
no los osciladores de cada preset, así que pasarlo a tabla habría sido reescribir
27 recetas sin red de seguridad. Lo razonable es escribir primero el test que
recorra los 27 presets y verifique la forma de la envolvente, y después
convertir.

**Deuda consciente:**

- `main.js` publica 119 globals a `window`. Es deliberado y es superficie pública
  de la que dependen partes externas, pero es deuda real.
- `src/ui/roll.js` (649) y `src/controls/playback.js` (618) siguen siendo
  ficheros grandes sin partir, aunque nada como `drawer.js` o `audio.js`.
- Sin Git. Se propuso y se decidió no usarlo, así que **todo el historial de
  este trabajo está sólo en estos documentos.** Es el mayor riesgo del
  proyecto.
- `HERMES_MIDIMATE_MIDIFORJA_HARDENING_PLAN.md` y `INTEGRACION.md` en la raíz
  describen un estado anterior. Este documento es el vigente.

**Sin confirmar:** con el roll visible y el staff a altura 0, el
`staffCanvas` queda 1560x0. El monolito viejo tenía 1560x560. Puede ser el
layout nuevo con el pentagrama oculto al no haber canción cargada, pero no se ha
confirmado que sea intencional.
