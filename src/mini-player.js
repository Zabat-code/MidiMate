// ============================================================
// src/mini-player.js - Mini-reproductor (paridad con MidiMate-web)
// ============================================================
import { song } from './song-state.js';
import { togglePlay, stopPlayback, seekBy, updatePlayButtonLabel } from './controls/playback.js';

function fmt(s){
  s = Math.max(0, Math.round(s||0));
  return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
}

export function initMiniPlayer(){
  const root = document.getElementById('miniPlayer');
  const btnMini = document.getElementById('btnMini');
  if (!root || !btnMini) return;

  let visible = false;
  function setVisible(v){
    visible = !!v;
    root.classList.toggle('open', visible);
    document.body.classList.toggle('mini-mode', visible);
    btnMini.classList.toggle('active-toggle', visible);
    updatePlayButtonLabel();
  }
  btnMini.addEventListener('click', ()=> setVisible(!visible));
  document.getElementById('miniRestore')?.addEventListener('click', ()=> setVisible(false));
  document.getElementById('miniPlay')?.addEventListener('click', togglePlay);
  document.getElementById('miniStop')?.addEventListener('click', stopPlayback);
  document.getElementById('miniRewind')?.addEventListener('click', ()=> seekBy(-5));
  document.getElementById('miniForward')?.addEventListener('click', ()=> seekBy(5));

  const head = document.getElementById('miniHead');
  let drag = null;
  head?.addEventListener('pointerdown', e=>{
    // No capturar el puntero si el usuario pulsó el botón de restaurar:
    // setPointerCapture redirigiría el click al cabecera y el botón no respondería.
    if (e.target.closest && e.target.closest('button')) return;
    const r = root.getBoundingClientRect();
    drag = { dx: e.clientX-r.left, dy: e.clientY-r.top };
    head.setPointerCapture(e.pointerId);
  });
  head?.addEventListener('pointermove', e=>{
    if (!drag || document.body.classList.contains('mini-mode')) return;
    root.style.left = Math.max(0, Math.min(window.innerWidth-290, e.clientX-drag.dx))+'px';
    root.style.top  = Math.max(0, Math.min(window.innerHeight-120, e.clientY-drag.dy))+'px';
    root.style.right = 'auto'; root.style.bottom = 'auto';
  });
  head?.addEventListener('pointerup', ()=>{ drag=null; });

  const titleEl = document.getElementById('miniTitle');
  const timeEl = document.getElementById('miniTime');
  const fillEl = document.getElementById('miniBarFill');
  const playEl = document.getElementById('miniPlay');
  function tick(){
    if (visible){
      if (titleEl) titleEl.textContent = song.fileName || '—';
      if (timeEl) timeEl.textContent = fmt(song.cursorTime)+' / '+fmt(song.duration);
      if (fillEl) fillEl.style.width = (song.duration ? Math.min(100, Math.max(0, song.cursorTime/song.duration*100)) : 0)+'%';
      if (playEl) playEl.textContent = song.playing ? '⏸' : '▶';
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  window.__midimateMini = { setVisible, isVisible:()=>visible };
}
