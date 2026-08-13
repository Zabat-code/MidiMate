# Design.md — MidiMate (rediseño)

Dirección visual: **"Concert Hall"** — un instrumento musical de gama alta, no
una app de configuración. Profundidad, latón pulido, y un acento de energía que
no sea solo dorado. Tipografía con carácter. Jerarquía clara. Accesible por teclado.

## IMPLEMENTACIÓN: TEMA OPCIONAL (toggle en Apariencia)
- El rediseño es un TEMA conmutable, no reemplaza el original.
- Selector en Ajustes → Apariencia → "Tema de interfaz":
  - `classic` (default) = paleta oscura original de MidiMate.
  - `concerthall` = este rediseño.
- Mecanismo: `body[data-theme="concerthall"]` sobreescribe las variables CSS.
  Sin atributo = classic. Conmutado por `CFG.uiTheme` (guardado en config).
- `applyDrawerLayout()` aplica `data-theme` al cargar y al cambiar el selector
  (cambio en vivo, sin recargar).
- Las fuentes Cormorant Garamond + Inter se cargan vía Google Fonts en el <head>;
  si no hay red, caen a Georgia / system-ui (fallback).

## Referencias (anclas de estilo)
- GarageBand / Logic Pro: superficies oscuras pero con profundidad y acentos vivos.
- Synthesia: claro contraste, tipografía legible, sin ruido.
- Linear / Arc: acentos de un solo color, micro-interacciones sutiles.

## Tokens de paleta
- `--bg-void:#0e0c16` (era #14121f — más profundo)
- `--bg-panel:#171427`
- `--bg-panel-2:#221d38` (era #211d38 — un pelo más claro para separar)
- `--bg-elev:#2c2547` (NUEVO: superficie elevada para popovers/drawer)
- `--brass:#d4a843` (era #c9a24b — latón más vivo)
- `--brass-soft:#f0cd73`
- `--ivory:#f4eede` (era #f2ead9 — más brillante)
- `--ivory-dim:#9b9384` (era #a89f8f — sube contraste)
- `--ebony:#0a0812`
- `--accent:#54d6c4` (NUEVO: acento de energía cian-verde para acción/activo)
- `--accent-soft:#7fe9da`
- `--correct:#5fd66a`
- `--wrong:#e8605c`
- `--line:rgba(244,238,222,0.14)` (era .12 — líneas un poco más vistas)
- `--shadow-1:0 2px 8px rgba(0,0,0,0.35)`
- `--shadow-2:0 12px 40px rgba(0,0,0,0.45)`

## Tipografía
- Display (títulos, headers de grupo): **'Cormorant Garamond', Georgia, serif** —
  serif elegante con carácter musical. Fallback Georgia.
- UI/cuerpo: **'Inter', -apple-system, system-ui, sans-serif**.
- Escala corregida (jerarquía sin saltos raros):
  - h1: 22px / 700
  - group-header: 17px / 600 (era 22.5px — bajado, era desproporcionado)
  - h2 (drawer): 14px / 600
  - body: 13px
  - small: 11px
- Los encabezados de grupo ya NO compiten con h1.

## Iconografía
- Reemplazar emojis por **SVG inline** unificados (stroke 1.6, color currentColor).
  Un set mínimo: play, pause, stop, settings, loop, metronome, piano, list, reset.
- Color de icono = currentColor para heredar estado.

## Estados / accesibilidad
- `:focus-visible` → outline 2px `--accent`, offset 2px (en button/select/input).
- `:active` → translateY(1px) + brillo.
- Botón primary usa `--brass`; botón de acción en vivo (Play activo) puede usar `--accent`.
- Contraste de `--ivory-dim` sobre panel ≥ 4.5:1.

## Drawer / ajustes
- Padding 28px → 22px. Grupos con menos borde, más aire.
- group-header: 17px, color `--brass-soft`, sin serif gigante.
- Respeta el acordeón ya existente (no romper lógica).

## Header
- Padding asimétrico corregido: `14px 22px` (era 64px derecha).
- El botón float de settings se separa bien del borde.

## Elevación
- Drawer y popovers usan `--bg-elev` + `--shadow-2`.
- mode-tab activo conserva su gradiente brass pero con `--shadow-1`.

## Notas de implementación
- Solo tocar `src/style.css` y los emojis en `index.html`.
- No romper layout (sidebar/dynamic/overlay).
- Build debe quedar en 0 errores.
