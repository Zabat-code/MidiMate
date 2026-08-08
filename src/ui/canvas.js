// ============================================================
// src/ui/canvas.js - Canvas y contextos
// ============================================================

const keysCanvas = document.getElementById('keysCanvas');
const rollCanvas = document.getElementById('rollCanvas');
const staffCanvas = document.getElementById('staffCanvas');

export const kctx = keysCanvas?.getContext('2d');
export const rctx = rollCanvas?.getContext('2d');
export const sctx = staffCanvas?.getContext('2d');

export function resizeCanvases() {
  const dpr = Math.max(devicePixelRatio, 1);
  const scale = dpr * 2;
  [keysCanvas, rollCanvas, staffCanvas].forEach(c => {
    if (!c) return;
    const rect = c.parentElement?.getBoundingClientRect();
    if (!rect) return;
    c.width = rect.width * scale;
    c.height = rect.height * scale;
  });
}

window.addEventListener('resize', resizeCanvases);
window.addEventListener('orientationchange', () => setTimeout(resizeCanvases, 200));

// También se necesita reajustar en cambios de orientación o zoom
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) resizeCanvases();
});