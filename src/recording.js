// ============================================================
// src/recording.js - Export video (in-browser recording)
// ============================================================
// Compose on an offscreen canvas at the output resolution (sheet +
// rollo de notas + teclado) y lo graba con MediaRecorder, junto con el
// audio real del sintetizador.
//
// OPTIMIZATION (lag fix):
//   Before, the REAL canvases' backing store was uploaded at the
//   salida (p.ej. 4K), lo que obligaba a TODO el render de la app a dibujar a
//   4K en cada frame -> lag masivo. Ahora los canvases reales se dejan a su
//   screen resolution and the output canvas (outCanvas) scales with
//   drawImage. The per-frame cost is ONE scaling operation, not redrawing
//   toda la app a 4K. Esto elimina el lag.
//   (Trade-off: la salida 4K es un upscale del canvas de pantalla, no 4K
//   natively. In exchange: smooth playback. Adjustable below if preferred
//   nitidez sobre rendimiento.)

import { CFG } from './config.js';
import { actx, masterGain } from './audio.js';
import { showToast } from './controls/playback.js';
import { applyFlags } from './controls/drawer.js';
import { resizeCanvases } from './ui/canvas.js';

export const RECORD_PRESETS = {
  yt4k:    { label: 'YouTube 4K (16:9)',              w: 3840, h: 2160, fps: 30 },
  yt1080:  { label: 'YouTube 1080p (16:9)',            w: 1920, h: 1080, fps: 30 },
  shorts:  { label: 'TikTok / Reels / Shorts (9:16)',  w: 1080, h: 1920, fps: 30 },
  square:  { label: 'Instagram feed (1:1)',            w: 1080, h: 1080, fps: 30 },
  twitter: { label: 'Twitter / X (16:9)',              w: 1280, h: 720,  fps: 30 }
};

let recording = false;
let mediaRecorder = null;
let chunks = [];
let outCanvas = null;
let outCtx = null;
let rafId = null;
let startedAt = 0;
let audioTapNode = null;
let uiRefs = null;
let originalSizes = null;
let origSheetView = null;

function forceSize(canvas, rect) {
  if (!canvas) return null;
  const prev = { w: canvas.width, h: canvas.height };
  // Only fix dimensions that are collapsed (0). The ones that already
  // have a valid size are NOT touched, to avoid forcing 4K everywhere and lag.
  if (canvas.width <= 0) canvas.width = Math.max(1, Math.round(rect.w));
  if (canvas.height <= 0) canvas.height = Math.max(1, Math.round(rect.h));
  return prev;
}

function layoutRects(w, h, isVertical) {
  // Top header drawn (title + status + timer) so the
  // top of the video isn't empty/weird (the app buttons are HTML,
  // no canvas, y no se graban). Luego staff, rollo y teclado.
  const headerH = Math.round(h * 0.045);
  const staffFrac = isVertical ? 0.11 : 0.16;
  const keysFrac = isVertical ? 0.14 : 0.17;
  const staffH = Math.round((h - headerH) * staffFrac);
  const keysH = Math.round((h - headerH) * keysFrac);
  const rollH = h - headerH - staffH - keysH;
  return {
    header: { x: 0, y: 0, w, h: headerH },
    staff:  { x: 0, y: headerH, w, h: staffH },
    roll:   { x: 0, y: headerH + staffH, w, h: rollH },
    keys:   { x: 0, y: headerH + staffH + rollH, w, h: keysH }
  };
}

function pickMimeType() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4'
  ];
  return candidates.find(c => window.MediaRecorder && MediaRecorder.isTypeSupported(c)) || '';
}

function updateTimer(ctx, rect, preset) {
  const secs = Math.floor((performance.now() - startedAt) / 1000);
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  const fs = Math.max(14, Math.round(rect.h * 0.42));
  ctx.fillStyle = '#f2ead9';
  ctx.font = `bold ${fs}px sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.fillText(`${mm}:${ss}`, rect.x + rect.w - fs * 0.6, rect.y + rect.h / 2);
  ctx.textAlign = 'left';
  if (uiRefs && uiRefs.timerEl) uiRefs.timerEl.textContent = `${mm}:${ss}`;
}

function drawHeader(rect, preset) {
  // Barra superior compacta: título a la izquierda, estado REC a la derecha.
  outCtx.fillStyle = '#15131f';
  outCtx.fillRect(rect.x, rect.y, rect.w, rect.h);
  outCtx.fillStyle = '#f2ead9';
  const fs = Math.max(13, Math.round(rect.h * 0.55));
  outCtx.font = `bold ${fs}px sans-serif`;
  outCtx.textBaseline = 'middle';
  outCtx.textAlign = 'left';
  outCtx.fillText('🎹 Piano', rect.x + fs * 0.5, rect.y + rect.h / 2);

  const status = recording ? '● REC' : (preset ? `● ${preset.w}×${preset.h}` : '●');
  outCtx.fillStyle = recording ? '#ff5555' : '#9aa0b5';
  outCtx.textAlign = 'right';
  outCtx.fillText(status, rect.x + rect.w - fs * 0.5, rect.y + rect.h / 2);
  outCtx.textAlign = 'left';
}

function drawLayer(src, rect, label) {
  if (!src) {
    outCtx.fillStyle = '#222';
    outCtx.fillRect(rect.x, rect.y, rect.w, rect.h);
    return;
  }
  // Ensure a valid backing store. If the layout gave 0 at this instant,
  // we retry resizeCanvases() (without forcing 4K: uses screen size,
  // so there's no lag) and check again.
  if (src.width <= 0 || src.height <= 0) {
    try { resizeCanvases(); } catch (e) {}
  }
  if (src.width <= 0 || src.height <= 0) {
    // Visible diagnostic in the video itself (the error isn't swallowed).
    outCtx.fillStyle = '#2a2030';
    outCtx.fillRect(rect.x, rect.y, rect.w, rect.h);
    outCtx.fillStyle = '#ff7777';
    const fs = Math.max(12, Math.round(rect.h * 0.12));
    outCtx.font = `${fs}px sans-serif`;
    outCtx.textAlign = 'center';
    outCtx.textBaseline = 'middle';
    outCtx.fillText(`${label}: canvas ${src.width}×${src.height}`, rect.x + rect.w / 2, rect.y + rect.h / 2);
    outCtx.textAlign = 'left';
    return;
  }
  try {
    outCtx.drawImage(src, rect.x, rect.y, rect.w, rect.h);
  } catch (e) {
    console.warn(`[Recording] drawImage failed on ${label}:`, e);
  }
}

function drawFrame(rects, preset) {
  if (!recording) return;
  const staffCanvas = document.getElementById('staffCanvas');
  const rollCanvas = document.getElementById('rollCanvas');
  const keysCanvas = document.getElementById('keysCanvas');

  outCtx.fillStyle = (CFG.background && CFG.background.color) || '#000';
  outCtx.fillRect(0, 0, preset.w, preset.h);

  // Header superior (estado + timer)
  drawHeader(rects.header, preset);
  updateTimer(outCtx, rects.header, preset);

  // Direct scaling of the real canvases (screen resolution) to the
  // output canvas. ONE drawImage per layer, cheap.
  drawLayer(staffCanvas, rects.staff, 'partitura');
  drawLayer(rollCanvas, rects.roll, 'rollo');
  drawLayer(keysCanvas, rects.keys, 'teclado');

  rafId = requestAnimationFrame(() => drawFrame(rects, preset));
}

function restoreAudioTap() {
  // Restore the canvases' original sizes (in case we forced them while recording).
  if (originalSizes) {
    const staffCanvas = document.getElementById('staffCanvas');
    const rollCanvas = document.getElementById('rollCanvas');
    const keysCanvas = document.getElementById('keysCanvas');
    if (originalSizes.staff && staffCanvas) { staffCanvas.width = originalSizes.staff.w; staffCanvas.height = originalSizes.staff.h; }
    if (originalSizes.roll && rollCanvas) { rollCanvas.width = originalSizes.roll.w; rollCanvas.height = originalSizes.roll.h; }
    if (originalSizes.keys && keysCanvas) { keysCanvas.width = originalSizes.keys.w; keysCanvas.height = originalSizes.keys.h; }
    originalSizes = null;
  }
  // Restaurar el flag de vista de partitura a como estaba antes de grabar.
  if (origSheetView !== null) {
    CFG.flags.sheetMusicView.value = origSheetView;
    origSheetView = null;
    try { applyFlags(); } catch (e) {}
  }
  if (audioTapNode) {
    try { masterGain.disconnect(audioTapNode); } catch (e) {}
    audioTapNode = null;
  }
}

export function startRecording(presetKey) {
  if (recording) return;
  const preset = RECORD_PRESETS[presetKey];
  if (!preset) { showToast('Invalid export format'); return; }

  if (!window.MediaRecorder) {
    showToast('Your browser doesn\'t support video recording (MediaRecorder unavailable)');
    return;
  }

  const isVertical = preset.h > preset.w;
  const rects = layoutRects(preset.w, preset.h, isVertical);

  // Ensure the real canvases have a valid backing store.
  // El padre de la partitura (staffWrap) mide 0 de alto cuando la "vista de
  // sheet" is hidden, which left the canvas at 0x0 and the video black.
  // We force ONLY the collapsed dimensions to the output-area size
  // (not everything to 4K), so there's no lag. Restored on stop.
  const staffCanvas = document.getElementById('staffCanvas');
  const rollCanvas = document.getElementById('rollCanvas');
  const keysCanvas = document.getElementById('keysCanvas');
  if (!rollCanvas || !keysCanvas) {
    showToast('No se encontraron los canvas de la app, no se puede grabar');
    return;
  }
  try { resizeCanvases(); } catch (e) { console.warn('[Recording] resize failed:', e); }
  originalSizes = {
    staff: forceSize(staffCanvas, rects.staff),
    roll: forceSize(rollCanvas, rects.roll),
    keys: forceSize(keysCanvas, rects.keys)
  };
  // LAG FIX (bug [7]): we DON'T activate the sheet if it's hidden. Forcing
  // sheetMusicView obligaba a redibujar la partitura cada frame -> lag en CPU
  // without GPU. Now the sheet is recorded ONLY if the user already had it active
  // (no extra render cost). If you want the sheet in the video, enable it in
  // the app before recording. The double resizeCanvases was removed (one is enough).
  origSheetView = CFG.flags.sheetMusicView.value;

  // NOTA: ya NO se sube el backing store de los canvases reales a la
  // output resolution (avoids lag). The output canvas scales with
  // drawImage from the screen size.
  outCanvas = document.createElement('canvas');
  outCanvas.width = preset.w;
  outCanvas.height = preset.h;
  outCtx = outCanvas.getContext('2d');

  const videoStream = outCanvas.captureStream(preset.fps);

  // Audio: nodo de captura conectado al master gain (solo "escucha").
  let combinedTracks = [...videoStream.getVideoTracks()];
  try {
    audioTapNode = actx.createMediaStreamDestination();
    masterGain.connect(audioTapNode);
    combinedTracks = combinedTracks.concat(audioTapNode.stream.getAudioTracks());
  } catch (e) {
    console.warn('Could not capture audio for the recording:', e);
    audioTapNode = null;
  }
  const combined = new MediaStream(combinedTracks);

  const mimeType = pickMimeType();
  if (!mimeType) {
    showToast('Your browser doesn\'t support any compatible recording format');
    restoreAudioTap();
    return;
  }

  chunks = [];
  try {
    mediaRecorder = new MediaRecorder(combined, {
      mimeType,
      videoBitsPerSecond: preset.w >= 3000 ? 40000000 : (preset.w >= 1900 ? 16000000 : 8000000)
    });
  } catch (e) {
    showToast('Could not start recording: ' + e.message);
    restoreAudioTap();
    return;
  }

  mediaRecorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  mediaRecorder.onstop = () => finishRecording(mimeType, preset);
  mediaRecorder.onerror = e => {
    console.error('[Recording] MediaRecorder error:', e);
    showToast('Error during recording, stopped');
    stopRecording();
  };

  mediaRecorder.start(1000);
  recording = true;
  startedAt = performance.now();

  if (uiRefs) {
    if (uiRefs.indicator) uiRefs.indicator.style.display = 'flex';
    if (uiRefs.toggleBtn) {
      uiRefs.toggleBtn.textContent = '⏹';
      uiRefs.toggleBtn.title = 'Stop recording (R)';
      uiRefs.toggleBtn.classList.add('active-toggle');
    }
    if (uiRefs.select) uiRefs.select.disabled = true;
  }

  drawFrame(rects, preset);
  showToast(`🔴 Recording in ${preset.label} (${preset.w}×${preset.h}). Press Play to play the song.`);
}

export function stopRecording() {
  if (!recording) return;
  recording = false;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  } else {
    restoreAudioTap();
  }
  if (uiRefs) {
    if (uiRefs.indicator) uiRefs.indicator.style.display = 'none';
    if (uiRefs.toggleBtn) {
      uiRefs.toggleBtn.textContent = '⏺';
      uiRefs.toggleBtn.title = 'Grabar video (R)';
      uiRefs.toggleBtn.classList.remove('active-toggle');
    }
    if (uiRefs.select) uiRefs.select.disabled = false;
  }
}

function finishRecording(mimeType, preset) {
  restoreAudioTap();
  if (!chunks.length) {
    showToast('The recording came out empty, try again');
    return;
  }
  const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
  const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  a.href = url;
  a.download = `piano-app_${preset.w}x${preset.h}_${stamp}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
  showToast(`✅ Video exportado (${ext.toUpperCase()}) y descargado`);
  chunks = [];
}

export function isRecording() {
  return recording;
}

export function initRecordingUI() {
  const select = document.getElementById('recordPresetSelect');
  const toggleBtn = document.getElementById('btnRecordToggle');
  const indicator = document.getElementById('recordingIndicator');
  const timerEl = document.getElementById('recordingTimer');
  if (!select || !toggleBtn) return;

  select.innerHTML = '';
  Object.entries(RECORD_PRESETS).forEach(([key, p]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = `${p.label} — ${p.w}×${p.h}`;
    select.appendChild(opt);
  });

  uiRefs = { select, toggleBtn, indicator, timerEl };

  toggleBtn.addEventListener('click', () => {
    if (recording) stopRecording();
    else startRecording(select.value);
  });

  window.addEventListener('beforeunload', () => {
    if (recording) restoreAudioTap();
  });
}
