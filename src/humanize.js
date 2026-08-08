// ============================================================
// src/humanize.js - Humanización y Swing
// ============================================================

export function getHumanizedTimeAndVel(time, vel, humanizeOpts) {
  if (!humanizeOpts.enabled) return { time, vel: Math.round(vel) };
  const seed1 = Math.sin(time * 12345.678) * 10000;
  const seed2 = Math.sin(time * 54321.987) * 10000;
  const jitterMs = (seed1 - Math.floor(seed1)) * 2 - 1;
  const jitterSec = jitterMs * (humanizeOpts.jitterTime / 1000);
  const velJitter = (seed2 - Math.floor(seed2)) * 2 - 1;
  const velFactor = 1 + velJitter * (humanizeOpts.jitterVel / 100);
  return {
    time: time + jitterSec,
    vel: Math.min(127, Math.max(1, Math.round(vel * velFactor)))
  };
}

export function applySwing(time, swingAmount, bpm) {
  if (swingAmount === 0) return time;
  const beatDur = 60 / (bpm || 120);
  const pos = time % beatDur;
  if (pos > beatDur * 0.25 && pos < beatDur * 0.75) {
    const delay = (swingAmount / 100) * 0.035;
    return time + delay;
  }
  return time;
}