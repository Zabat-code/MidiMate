// ============================================================
// src/ui/roll.js - Notas cayendo y efectos visuales
// ============================================================

import { rctx, resizeCanvases } from './canvas.js';
import { getKeyLayout, isBlack } from './keys.js';
import { CFG } from '../config.js';
import { currentTheme, CHROMA_COLORS } from '../controls/drawer.js';
import { noteLabelName } from '../i18.js';
import { song, appMode, freeNotes, trackSettings } from '../controls/playback.js';

export const LOOKAHEAD = 2.2;
export const CORRECT_RGB = '111,191,115';
export const WRONG_RGB = '217,83,79';

// ===== DYNAMIC CAMERA =====
// Adjusts the effective "lookahead" according to the density of upcoming notes,
// smoothing the transition with CFG.cameraSmoothing.
// Original idea: when there are many upcoming notes, the lookahead is reduced
// so notes appear larger and more separated. When there are few,
// the lookahead increases to see further ahead.
let effectiveLookahead = LOOKAHEAD;

function updateDynamicCamera(t) {
  if (!CFG.flags.dynamicCamera.value) {
    effectiveLookahead = LOOKAHEAD;
    return effectiveLookahead;
  }
  if (!song.notes || !song.notes.length) return effectiveLookahead;
  const windowSec = 2.0;
  let count = 0;
  for (let i = 0; i < song.notes.length; i++) {
    const n = song.notes[i];
    if (n.start >= t && n.start <= t + windowSec) count++;
  }
  const density = count / windowSec;
  // Wider range so the effect is noticeable
  const minLA = LOOKAHEAD * 0.5;
  const maxLA = LOOKAHEAD * 1.8;
  const target = Math.min(maxLA, Math.max(minLA, LOOKAHEAD * (0.6 + Math.min(density, 10) / 10 * 1.2)));
  const smoothing = CFG.cameraSmoothing || 0.3;
  effectiveLookahead += (target - effectiveLookahead) * smoothing;
  return effectiveLookahead;
}

// ===== EFECTOS VISUALES =====
export let keyEffects = [];
export const heldEffectStart = new Map();

export function spawnKeyEffect(note, rgb, chromaColor) {
  if (!CFG.flags.keyPressEffects.value) return;
  const style = CFG.keyFxStyle;
  let particles = [],
    duration = 400;
  const layout = getKeyLayout();
  if (!layout || !layout[note]) return;
  const kw = layout[note].w;

  if (style === 'sparks') {
    duration = 600;
    for (let i = 0; i < 20; i++) {
      particles.push({ angle: (-Math.PI / 2) + (Math.random() - 0.5) * 2.4, speed: 120 + Math.random() * 160, size: 4 + Math.random() * 5 });
    }
  } else if (style === 'smoke') {
    duration = 1000;
    for (let i = 0; i < 12; i++) {
      particles.push({ dx: (Math.random() - 0.5) * 60, speed: 40 + Math.random() * 40, size: 20 + Math.random() * 22, delay: Math.random() * 120 });
    }
  } else if (style === 'fire') {
    duration = 700;
    const leftX = -kw * 0.3;
    const rightX = kw * 0.3;
    for (let side = 0; side < 2; side++) {
      const baseX = side === 0 ? leftX : rightX;
      for (let i = 0; i < 10; i++) {
        particles.push({
          dx: baseX + (Math.random() - 0.5) * 0.15,
          speed: 60 + Math.random() * 100,
          size: 8 + Math.random() * 12,
          delay: Math.random() * 80,
          flicker: Math.random() * 6.28,
          side: side
        });
      }
    }
  } else if (style === 'bubbles') {
    duration = 1200;
    for (let i = 0; i < 14; i++) {
      particles.push({ dx: (Math.random() - 0.5) * 60, wobble: Math.random() * 6.28, speed: 45 + Math.random() * 60, size: 7 + Math.random() * 11, delay: Math.random() * 150 });
    }
  } else if (style === 'lightning') {
    duration = 450;
    const LIGHTNING_SCALE = 1.7;
    for (let side = 0; side < 2; side++) {
      const baseX = side === 0 ? -kw * 0.25 * LIGHTNING_SCALE : kw * 0.25 * LIGHTNING_SCALE;
      const pts = [];
      let x = baseX,
        y = 0;
      for (let s = 0; s < 8; s++) {
        x += (Math.random() - 0.5) * 0.1 * LIGHTNING_SCALE;
        y -= (0.14 + Math.random() * 0.08) * LIGHTNING_SCALE;
        pts.push({ x, y });
      }
      particles.push({ pts, jitter: Math.random() * 0.04 - 0.02, side });
    }
  } else if (style === 'explosion') {
    duration = 600;
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 200;
      particles.push({ angle, speed, size: 3 + Math.random() * 6, delay: Math.random() * 80 });
    }
  } else if (style === 'wave') {
    duration = 800;
    const WAVE_SCALE = 1.6;
    for (let i = 0; i < 10; i++) {
      particles.push({ phase: Math.random() * Math.PI * 2, speed: (40 + Math.random() * 60) * WAVE_SCALE, width: (30 + Math.random() * 40) * WAVE_SCALE, delay: Math.random() * 100 });
    }
  } else if (style === 'rain') {
    duration = 700;
    for (let i = 0; i < 25; i++) {
      particles.push({ dx: (Math.random() - 0.5) * 80, speed: 100 + Math.random() * 120, size: 2 + Math.random() * 4, delay: Math.random() * 120 });
    }
  } else {
    // flash
    duration = 400;
    particles = [];
  }

  const color = chromaColor || rgb || '255,255,255';
  keyEffects.push({ note, rgb: color, start: performance.now(), style, particles, duration, keyWidth: kw });
}

export function drawKeyEffects(w, h) {
  const now = performance.now();
  keyEffects = keyEffects.filter(fx => now - fx.start < fx.duration);
  const layout = getKeyLayout();
  if (!layout) return;

  keyEffects.forEach(fx => {
    const lay = layout[fx.note];
    if (!lay) return;
    const age = (now - fx.start) / fx.duration;
    const cx = (lay.x + lay.w / 2) * w;
    const baseY = h - 4;
    const rgb = fx.rgb;
    const kw = fx.keyWidth * w;

    // Pulido visual: blending aditivo solo en efectos brillantes para que
    // "brillen" sobre el rollo. Los suaves (smoke/bubbles/wave/flash) quedan
    // en source-over para no verse raros.
    const ADDITIVE = new Set(['sparks', 'fire', 'lightning', 'explosion', 'rain']);
    rctx.save();
    if (ADDITIVE.has(fx.style)) rctx.globalCompositeOperation = 'lighter';

    if (fx.style === 'fire') {
      fx.particles.forEach(p => {
        const localAge = Math.max(0, (now - fx.start - p.delay)) / fx.duration;
        if (localAge <= 0) return;
        const side = p.side || 0;
        const baseX = side === 0 ? cx - kw * 0.3 : cx + kw * 0.3;
        const wob = Math.sin(localAge * 6 + p.flicker) * (kw * 0.08);
        const px = baseX + p.dx * kw + wob;
        const py = baseY - p.speed * localAge * 1.6;
        const fireColor = localAge < 0.4 ? '255,210,90' : (localAge < 0.75 ? '255,120,40' : '200,40,20');
        rctx.beginPath();
        rctx.fillStyle = `rgba(${fireColor},${Math.max(1 - localAge, 0) * 0.9})`;
        const sz = p.size * (1 - localAge * 0.5) * (kw / 30);
        rctx.arc(px, py, Math.max(sz, 1), 0, Math.PI * 2);
        rctx.fill();
      });
    } else if (fx.style === 'lightning') {
      fx.particles.forEach(p => {
        const side = p.side || 0;
        const baseX = side === 0 ? cx - kw * 0.25 : cx + kw * 0.25;
        rctx.strokeStyle = `rgba(${rgb},${Math.max(1 - age, 0)})`;
        rctx.lineWidth = 3 + (kw / 30) * 2;
        rctx.shadowColor = `rgba(${rgb},0.9)`;
        rctx.shadowBlur = 16 * (kw / 30);
        rctx.beginPath();
        rctx.moveTo(baseX, baseY);
        p.pts.forEach(pt => rctx.lineTo(baseX + pt.x * kw, baseY + pt.y * kw));
        rctx.stroke();
        rctx.shadowBlur = 0;
      });
    } else {
      // Resto de efectos (sparks, smoke, bubbles, explosion, wave, rain, flash)
      if (fx.style === 'sparks') {
        fx.particles.forEach(p => {
          const dist = p.speed * age * 0.8;
          const px = cx + Math.cos(p.angle) * dist;
          const py = baseY + Math.sin(p.angle) * dist + age * age * 120;
          rctx.beginPath();
          rctx.fillStyle = `rgba(${rgb},${Math.max(1 - age, 0) * 0.95})`;
          rctx.arc(px, py, Math.max(p.size * (1 - age * 0.3), 0.5), 0, Math.PI * 2);
          rctx.fill();
        });
      } else if (fx.style === 'smoke') {
        fx.particles.forEach(p => {
          const localAge = Math.max(0, (now - fx.start - p.delay)) / fx.duration;
          if (localAge <= 0) return;
          const px = cx + p.dx;
          const py = baseY - p.speed * localAge * 1.8;
          rctx.beginPath();
          rctx.fillStyle = `rgba(${rgb},${Math.max(1 - localAge, 0) * 0.4})`;
          rctx.arc(px, py, p.size * (1 + localAge * 2.2), 0, Math.PI * 2);
          rctx.fill();
        });
      } else if (fx.style === 'bubbles') {
        fx.particles.forEach(p => {
          const localAge = Math.max(0, (now - fx.start - p.delay)) / fx.duration;
          if (localAge <= 0) return;
          const px = cx + p.dx + Math.sin(localAge * 6 + p.wobble) * 12;
          const py = baseY - p.speed * localAge * 1.4;
          rctx.beginPath();
          rctx.strokeStyle = `rgba(${rgb},${Math.max(1 - localAge, 0) * 0.9})`;
          rctx.lineWidth = 2.5;
          rctx.arc(px, py, p.size * (1 + localAge * 0.8), 0, Math.PI * 2);
          rctx.stroke();
          rctx.fillStyle = `rgba(255,255,255,${Math.max(1 - localAge, 0) * 0.2})`;
          rctx.fill();
        });
      } else if (fx.style === 'explosion') {
        fx.particles.forEach(p => {
          const localAge = Math.max(0, (now - fx.start - p.delay)) / fx.duration;
          if (localAge <= 0) return;
          const dist = p.speed * localAge * 0.9;
          const px = cx + Math.cos(p.angle) * dist;
          const py = baseY + Math.sin(p.angle) * dist - localAge * 20;
          rctx.beginPath();
          rctx.fillStyle = `rgba(${rgb},${Math.max(1 - localAge, 0) * 0.95})`;
          const sz = p.size * (1 + localAge * 1.2);
          rctx.arc(px, py, sz, 0, Math.PI * 2);
          rctx.fill();
        });
      } else if (fx.style === 'wave') {
        fx.particles.forEach(p => {
          const localAge = Math.max(0, (now - fx.start - p.delay)) / fx.duration;
          if (localAge <= 0) return;
          const rad = localAge * (p.width + 40);
          const angle = p.phase + localAge * 3;
          const px = cx + Math.cos(angle) * rad;
          const py = baseY + Math.sin(angle) * rad * 0.4 - localAge * 30;
          rctx.beginPath();
          rctx.strokeStyle = `rgba(${rgb},${Math.max(1 - localAge, 0) * 0.6})`;
          rctx.lineWidth = 2 + localAge * 2;
          rctx.arc(cx, baseY, rad, angle - 0.3, angle + 0.3);
          rctx.stroke();
        });
      } else if (fx.style === 'rain') {
        fx.particles.forEach(p => {
          const localAge = Math.max(0, (now - fx.start - p.delay)) / fx.duration;
          if (localAge <= 0) return;
          const px = cx + p.dx + Math.sin(localAge * 10) * 6;
          const py = baseY - p.speed * localAge * 1.5;
          rctx.beginPath();
          rctx.fillStyle = `rgba(${rgb},${Math.max(1 - localAge, 0) * 0.9})`;
          rctx.fillRect(px - 1, py - 4, 2, 8);
          rctx.fillStyle = `rgba(255,255,255,${Math.max(1 - localAge, 0) * 0.3})`;
          rctx.fillRect(px - 1, py - 6, 2, 4);
        });
      } else {
        // flash
        const radius = (kw * 0.6) * (1 + age * 1.6);
        const grad = rctx.createRadialGradient(cx, baseY, 0, cx, baseY, Math.max(radius, 2));
        grad.addColorStop(0, `rgba(${rgb},${Math.max(1 - age, 0) * 0.65})`);
        grad.addColorStop(1, `rgba(${rgb},0)`);
        rctx.fillStyle = grad;
        rctx.beginPath();
        rctx.arc(cx, baseY, Math.max(radius, 2), 0, Math.PI * 2);
        rctx.fill();
      }
    }
    rctx.restore();
  });

  // Efectos continuos (al mantener presionada la tecla)
  if (CFG.flags.keyPressEffects.value) {
    const th = currentTheme();
    const style = CFG.keyFxStyle;
    heldEffectStart.forEach((startT, note) => {
      const lay = layout[note];
      if (!lay) return;
      const heldMs = now - startT;
      const held = Math.min(heldMs / 1200, 1);
      const cx = (lay.x + lay.w / 2) * w;
      const baseY = h - 4;
      const rgb = lay.black ? th.noteBlack : th.noteWhite;
      const kw = lay.w * w;

      if (style === 'fire') {
        const count = 12;
        for (let side = 0; side < 2; side++) {
          const baseX = side === 0 ? cx - kw * 0.3 : cx + kw * 0.3;
          for (let i = 0; i < count / 2; i++) {
            const localAge = ((heldMs + i * 70) % 500) / 500;
            const wob = Math.sin(localAge * 6 + i) * (kw * 0.08);
            const px = baseX + wob;
            const py = baseY - localAge * (80 + held * 100);
            const size = (6 + held * 8) * (1 - localAge * 0.5) * (kw / 30);
            const fc = localAge < 0.4 ? '255,210,90' : (localAge < 0.75 ? '255,120,40' : '200,40,20');
            rctx.beginPath();
            rctx.fillStyle = `rgba(${fc},${Math.max(1 - localAge, 0) * 0.9})`;
            rctx.arc(px, py, Math.max(size, 1), 0, Math.PI * 2);
            rctx.fill();
          }
        }
      } else if (style === 'lightning') {
        const bolts = 3;
        for (let side = 0; side < 2; side++) {
          const baseX = side === 0 ? cx - kw * 0.25 : cx + kw * 0.25;
          for (let i = 0; i < bolts; i++) {
            if (Math.floor(heldMs / 100 + i * 3 + side) % 3 !== 0) continue;
            rctx.strokeStyle = `rgba(${rgb},0.9)`;
            rctx.lineWidth = 3 + held * 3;
            rctx.shadowColor = `rgba(${rgb},0.9)`;
            rctx.shadowBlur = 14 + held * 14;
            rctx.beginPath();
            rctx.moveTo(baseX, baseY);
            let x = baseX,
              y = baseY;
            for (let s = 0; s < 6; s++) {
              x += (Math.random() - 0.5) * (kw * 0.15);
              y -= (kw * 0.12 + held * 0.08);
              rctx.lineTo(x, y);
            }
            rctx.stroke();
            rctx.shadowBlur = 0;
          }
        }
      } else {
        // Resto de efectos continuos
        if (style === 'sparks') {
          const count = 10;
          for (let i = 0; i < count; i++) {
            const seed = Math.floor(heldMs / 70) + i * 37;
            const localAge = ((heldMs + i * 45) % 360) / 360;
            const angle = (-Math.PI / 2) + ((seed % 100) / 100 - 0.5) * 2.0;
            const dist = localAge * (90 + held * 120);
            const px = cx + Math.cos(angle) * dist;
            const py = baseY + Math.sin(angle) * dist + localAge * localAge * 90;
            const size = (3 + held * 4) * (1 - localAge * 0.3);
            rctx.beginPath();
            rctx.fillStyle = `rgba(${rgb},${Math.max(1 - localAge, 0) * 0.95})`;
            rctx.arc(px, py, Math.max(size, 0.5), 0, Math.PI * 2);
            rctx.fill();
          }
        } else if (style === 'smoke') {
          const count = 8;
          for (let i = 0; i < count; i++) {
            const localAge = ((heldMs + i * 200) % 900) / 900;
            const px = cx + Math.sin(i * 2 + heldMs * 0.001) * (20 + held * 14);
            const py = baseY - localAge * (120 + held * 80);
            const size = (14 + held * 18) * (1 + localAge * 2.0);
            rctx.beginPath();
            rctx.fillStyle = `rgba(${rgb},${Math.max(1 - localAge, 0) * (0.3 + held * 0.2)})`;
            rctx.arc(px, py, size, 0, Math.PI * 2);
            rctx.fill();
          }
        } else if (style === 'bubbles') {
          const count = 8;
          for (let i = 0; i < count; i++) {
            const localAge = ((heldMs + i * 160) % 1000) / 1000;
            const px = cx + Math.sin(i * 2.3) * 25 + Math.sin(localAge * 6 + i) * 14;
            const py = baseY - localAge * (90 + held * 80);
            const size = (5 + held * 7) * (1 + localAge * 0.6);
            rctx.beginPath();
            rctx.strokeStyle = `rgba(${rgb},${Math.max(1 - localAge, 0) * 0.9})`;
            rctx.lineWidth = 2.5;
            rctx.arc(px, py, size, 0, Math.PI * 2);
            rctx.stroke();
          }
        } else if (style === 'explosion') {
          const count = 20;
          for (let i = 0; i < count; i++) {
            const localAge = ((heldMs + i * 60) % 500) / 500;
            const angle = (i / count) * Math.PI * 2 + heldMs * 0.002;
            const dist = localAge * (100 + held * 100);
            const px = cx + Math.cos(angle) * dist;
            const py = baseY + Math.sin(angle) * dist - localAge * 40;
            const sz = (3 + held * 5) * (1 - localAge * 0.4);
            rctx.beginPath();
            rctx.fillStyle = `rgba(${rgb},${Math.max(1 - localAge, 0) * 0.9})`;
            rctx.arc(px, py, sz, 0, Math.PI * 2);
            rctx.fill();
          }
        } else if (style === 'wave') {
          const count = 6;
          for (let i = 0; i < count; i++) {
            const localAge = ((heldMs + i * 120) % 800) / 800;
            const rad = localAge * (80 + held * 60);
            const angle = i * 1.2 + localAge * 2.5;
            const px = cx + Math.cos(angle) * rad;
            const py = baseY + Math.sin(angle) * rad * 0.3 - localAge * 40;
            rctx.beginPath();
            rctx.strokeStyle = `rgba(${rgb},${Math.max(1 - localAge, 0) * 0.5})`;
            rctx.lineWidth = 2 + localAge * 3;
            rctx.arc(cx, baseY, rad, angle - 0.4, angle + 0.4);
            rctx.stroke();
          }
        } else if (style === 'rain') {
          const count = 15;
          for (let i = 0; i < count; i++) {
            const localAge = ((heldMs + i * 70) % 600) / 600;
            const px = cx + Math.sin(i * 5 + heldMs * 0.003) * 30;
            const py = baseY - localAge * (100 + held * 80);
            rctx.beginPath();
            rctx.fillStyle = `rgba(${rgb},${Math.max(1 - localAge, 0) * 0.8})`;
            rctx.fillRect(px - 1.5, py - 6, 3, 12);
            rctx.fillStyle = `rgba(255,255,255,${Math.max(1 - localAge, 0) * 0.3})`;
            rctx.fillRect(px - 1.5, py - 8, 3, 4);
          }
        } else {
          const radius = (kw * 0.6) * (1 + held * 1.5);
          rctx.beginPath();
          rctx.fillStyle = `rgba(${rgb},${0.15 + held * 0.4})`;
          rctx.arc(cx, baseY, radius, 0, Math.PI * 2);
          rctx.fill();
        }
      }
    });
  }
}

// ===== DRAW TILE =====
export function drawTile(ctx, x, y, w, h, color, note) {
  const skin = CFG.tileSkin;
  if (skin === 'glow') {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 40;
    ctx.fillStyle = color;
    roundRect(ctx, x, y, w, h, 5);
    ctx.fill();
    roundRect(ctx, x, y, w, h, 5);
    ctx.fill();
    ctx.shadowBlur = 55;
    roundRect(ctx, x, y, w, h, 5);
    ctx.fill();
    ctx.restore();
  } else if (skin === 'outline') {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, h, 5);
    ctx.stroke();
  } else {
    ctx.fillStyle = color;
    roundRect(ctx, x, y, w, h, 5);
    ctx.fill();
  }
  // Mostrar nombre de nota en tile si flag activo.
  // Mismo criterio de tamaño que las teclas del piano: las teclas blancas
  // usan kw*0.42 y las negras kw*0.5 (kw = ancho de la tecla). El tile recibe
  // en `w` el ancho de la tecla correspondiente, así que usamos el mismo
  // factor para que el texto mida IGUAL que en el piano. Anclado al PIE.
  if (CFG.flags.showNoteNamesTiles.value && note !== undefined) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    const isBlackKey = [1, 3, 6, 8, 10].includes(((note % 12) + 12) % 12);
    const factor = isBlackKey ? 0.5 : 0.42;
    const fs = Math.max(11, Math.round(w * factor));
    ctx.font = `${fs}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(noteLabelName(note, CFG.noteNaming), x + w / 2, y + h - 3);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ===== DRAW ROLL =====
export function drawRoll() {
  if (!rctx) return;
  const w = rctx.canvas.width,
    h = rctx.canvas.height;
  if (w === 0 || h === 0) return;
  rctx.clearRect(0, 0, w, h);

  const t = song.cursorTime || 0;
  const th = currentTheme();
  const layout = getKeyLayout();
  if (!layout) return;

  // Modo Libre
  if (appMode === 'free') {
    drawFreeTiles(w, h);
    drawKeyEffects(w, h);
    return;
  }

  // Dynamic camera: adjusts how much "lookahead" is shown based on note density
  const lookahead = updateDynamicCamera(t);

  // Measure lines (with optional BPM pulse)
  drawBeatLines(w, h, t, lookahead);

  // Notas cayendo
  if (CFG.flags.fallingNotes.value && song.notes && song.notes.length) {
    const trackSettings = window.trackSettings || {};
    const perspectiveOn = CFG.flags.perspective3D.value;
    const depthAmount = (CFG.perspectiveDepth || 0) / 100;
    song.notes.forEach(n => {
      const trackCfg = trackSettings[n.track];
      if (trackCfg && (trackCfg.visible === false || trackCfg.disabled)) return;
      if (n.end < t - 0.5 || n.start > t + lookahead) return;
      const lay = layout[n.note];
      if (!lay) return;
      const x = lay.x * w,
        kw = lay.w * w;
      const yTop = h * (1 - (n.end - t) / lookahead);
      const yBot = h * (1 - (n.start - t) / lookahead);
      const played = n.start < t;
      let color;
      if (CFG.tileSkin === 'tracks') {
        const cfg = trackSettings[n.track];
        color = cfg && cfg.color ? cfg.color : '#ffffff';
        if (played) color = adjustColor(color, 0.5);
      } else if (CFG.tileSkin === 'chroma') {
        color = `rgba(${CHROMA_COLORS[n.note % 12]},${played ? 0.55 : 0.85})`;
      } else {
        color = lay.black ?
          (played ? `rgba(${th.played},0.55)` : `rgba(${th.noteBlack},0.85)`) :
          (played ? `rgba(${th.played},0.55)` : `rgba(${th.noteWhite},0.85)`);
      }
      let rw = Math.max(kw - 3, 4);
      let tileX = x + 1.5;
      if (perspectiveOn && depthAmount > 0) {
        // 3D perspective: tiles are born small (0.6x) and grow up to the
        // key size (1.0x) upon reaching the keyboard. Never larger.
        const proximity = Math.max(0, Math.min(1, yBot / h));
        // Scale: far 0.6x, near 1.0x (key size)
        const scale = 0.6 + proximity * (0.4 + depthAmount * 0.1);
        const scaledW = rw * scale;
        tileX = tileX + rw / 2 - scaledW / 2;
        rw = scaledW;
        // Opacity: farther more transparent, nearer more solid
        const alpha = 0.4 + proximity * 0.6;
        rctx.globalAlpha = alpha;
        drawTile(rctx, tileX, yTop, rw, Math.max(yBot - yTop, 4), color, n.note);
        rctx.globalAlpha = 1;
        return;
      }
      drawTile(rctx, tileX, yTop, rw, Math.max(yBot - yTop, 4), color, n.note);
    });
  }

  drawKeyEffects(w, h);
}

function drawBeatLines(w, h, t, lookahead) {
  lookahead = lookahead || LOOKAHEAD;
  if (!CFG.flags.showBeatLines.value || !song.duration) return;
  const beatDur = 60 / (song.bpm || 120);
  const kStart = Math.floor((t - 0.5) / beatDur);
  const kEnd = Math.ceil((t + lookahead) / beatDur);
  const pulseOn = CFG.flags.bpmPulse.value;
  const intensity = CFG.pulseIntensity != null ? CFG.pulseIntensity : 0.5;
  let pulseFactor = 0;
  let currentBeatK = null;
  if (pulseOn && beatDur > 0) {
    // Fase del beat: 0 en el downbeat, 1 justo antes del siguiente
    const phase = (t % beatDur) / beatDur;
    // More noticeable pulse: decays faster and with more amplitude
    pulseFactor = Math.max(0, 1 - phase * 3);
    currentBeatK = Math.floor(t / beatDur);
  }
  for (let k = kStart; k <= kEnd; k++) {
    if (k < 0) continue;
    const beatTime = k * beatDur;
    const y = h * (1 - (beatTime - t) / lookahead);
    if (y < 0 || y > h) continue;
    const isMeasure = (k % 4 === 0);
    let alpha = isMeasure ? 0.22 : 0.09;
    let lineW = isMeasure ? 1.4 : 1;
    if (pulseOn && k === currentBeatK) {
      // The current beat line "lags": much brighter and thicker on the downbeat
      alpha += pulseFactor * intensity * 1.2;
      lineW += pulseFactor * intensity * 8;
      // Very visible pulsing golden glow on the current beat line
      rctx.strokeStyle = `rgba(224,189,109,${Math.min(alpha, 1)})`;
      rctx.shadowColor = 'rgba(224,189,109,1)';
      rctx.shadowBlur = pulseFactor * intensity * 30;
    } else {
      rctx.strokeStyle = `rgba(242,234,217,${alpha})`;
      rctx.shadowBlur = 0;
    }
    rctx.lineWidth = lineW;
    rctx.beginPath();
    rctx.moveTo(0, y);
    rctx.lineTo(w, y);
    rctx.stroke();
    rctx.shadowBlur = 0;
  }
  if (pulseOn && pulseFactor > 0) {
    // Resplandor dorado en la parte inferior (cerca del teclado) que late con el beat
    const glowAlpha = pulseFactor * intensity * 0.8;
    const grad = rctx.createLinearGradient(0, h - 80, 0, h);
    grad.addColorStop(0, 'rgba(201,162,75,0)');
    grad.addColorStop(1, `rgba(201,162,75,${glowAlpha})`);
    rctx.fillStyle = grad;
    rctx.fillRect(0, h - 80, w, 80);
  }
}

function drawFreeTiles(w, h) {
  const now = performance.now() / 1000;
  const rate = h / LOOKAHEAD;
  const th = currentTheme();
  const layout = getKeyLayout();
  if (!layout) return;

  const filtered = freeNotes.filter(e => e.end == null || (now - e.end) * rate < h + 40);
  filtered.forEach(e => {
    const lay = layout[e.note];
    if (!lay) return;
    const elapsedStart = now - e.start;
    const elapsedEnd = e.end ? now - e.end : 0;
    const yTop = h - elapsedStart * rate;
    const yBot = h - elapsedEnd * rate;
    const x = lay.x * w,
      kw = lay.w * w;
    let color;
    if (CFG.tileSkin === 'tracks') {
      const cfg = trackSettings[e.track];
      color = cfg && cfg.color ? cfg.color : '#ffffff';
    } else if (CFG.tileSkin === 'chroma') {
      color = `rgba(${CHROMA_COLORS[e.note % 12]},0.85)`;
    } else {
      color = lay.black ? `rgba(${th.noteBlack},0.85)` : `rgba(${th.noteWhite},0.85)`;
    }
    drawTile(rctx, x + 1.5, yTop, Math.max(kw - 3, 4), Math.max(yBot - yTop, 4), color, e.note);
  });
}

function adjustColor(hex, factor) {
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  r = Math.round(r * factor);
  g = Math.round(g * factor);
  b = Math.round(b * factor);
  return `#${[r, g, b].map(c => c.toString(16).padStart(2, '0')).join('')}`;
}