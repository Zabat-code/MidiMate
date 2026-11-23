// ============================================================
// src/toast.js - Aviso flotante
// ============================================================

import { CFG } from './config.js';

// showToast vive aquí, y no en playback.js, porque lo necesitan módulos que
// playback.js importa (audio.js) o quePlayback.js no puede importar sin
// cerrar un ciclo. Antes esos módulos hacían window.showToast(...), que sólo
// funcionaba si main.js ya había publicado el global: una ruta que reventaba
// con "showToast is not a function" en cuanto se llamaba antes de tiempo.
// Este módulo sólo depende de config.js, así que no crea ningún ciclo.

let toastTimer = null;

export function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), (CFG?.toastDuration ?? 3) * 1000);
}
