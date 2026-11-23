// ============================================================
// src/playlist-store.js - Estado compartido de la lista de reproducción
// ============================================================

// Estado de la lista de reproducción, separado de playlist.js a propósito.
// Lo leen playback.js (loop de canción y salto al terminar), transport.js,
// config.js (al guardar) y report.js (estado de la app). Importarlo desde
// playlist.js crearía un ciclo, y por eso antes vivía en window.playlist y
// window.currentPlaylistIndex.
//
// Eso además estaba mal: currentPlaylistIndex es un número que se reasigna,
// así que la copia publicada en main.js se quedaba obsoleta en cuanto se
// cambiaba de pista. Aquí los consumidores importan el binding vivo, que
// siempre refleja el valor real.

export const playlist = [];

export let currentPlaylistIndex = -1;

export function setCurrentPlaylistIndex(index) {
  currentPlaylistIndex = index;
}

export function nextPlaylistIndex() {
  if (!playlist.length) return;
  setCurrentPlaylistIndex(((currentPlaylistIndex + 1) % playlist.length + playlist.length) % playlist.length);
  return playlist[currentPlaylistIndex];
}

// ---- Salto a la siguiente pista: inversión de control.
//
// playback.js necesita "pasa a la siguiente canción" al terminar (loop de
// canción), pero la implementación vive en playlist.js, que ya importa de
// playback.js. Importarlo al revés cerraría un ciclo, que es justo por lo que
// antes se llamaba a window.playNextFromPlaylist(). En vez de un global,
// playlist.js registra aquí su función y playback.js la pide al store.
let advanceHandler = null;

export function setPlaylistAdvanceHandler(fn) {
  advanceHandler = typeof fn === 'function' ? fn : null;
}

export function advanceToNextPlaylistTrack() {
  if (!playlist.length || !advanceHandler) return;
  advanceHandler();
}
