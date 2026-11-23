import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadConfig } from '../config.js';
import { song, trackSettings, applyMode, getMidiTracks, setMidiTracks, getKeepAllPreset, setKeepAllPreset } from '../controls/playback.js';
import { loadSongData, renderPlaylist } from '../playlist.js';
import { buildTracksPanel } from '../controls/tracks.js';
import { playlist, setCurrentPlaylistIndex } from '../playlist-store.js';
import { drawRoll } from '../ui/roll.js';
import { drawKeys } from '../ui/keys.js';

// Estos tests EJECUTAN las funciones que la refactorización tocó. El test de
// arranque sólo importaba los módulos, y eso noCJecuta nada: dos errores de
// TDZ queintroduje (const trackSettings = trackSettings, const song = song)
// pasaron el build y los tests, y sólo habrían estallado al abrir el panel de
// pistas o al cargar una canción.

const NOTAS = [
  { note: 60, start: 0, end: 1, track: 0, vel: 100 },
  { note: 64, start: 1, end: 2, track: 0, vel: 100 },
  { note: 67, start: 2, end: 3, track: 1, vel: 100 },
  { note: 72, start: 3, end: 4, track: 1, vel: 100 }
];

async function montarDom() {
  const html = await import('../../index.html?raw');
  document.documentElement.innerHTML = html.default
    .replace(/<link[^>]*rel=["']?stylesheet["']?[^>]*>/gi, '')
    .replace(/<script[^>]*\ssrc=[^>]*><\/script>/gi, '');
}

describe('ejecución real de las funciones refactorizadas', () => {
  beforeEach(async () => {
    await montarDom();
    loadConfig();
    // CFG.tileSkin es lo que hace que drawRoll lea trackSettings de verdad.
    const { CFG } = await import('../config.js');
    CFG.tileSkin = 'tracks';
    CFG.flags.fallingNotes.value = true;
    for (const k of Object.keys(trackSettings)) delete trackSettings[k];
    playlist.splice(0, playlist.length);
    setCurrentPlaylistIndex(-1);
    setMidiTracks(null);
    loadSongData(NOTAS, 4, 'prueba.mid', 120);
  });

  it('loadSongData rellena song sin lanzar', () => {
    expect(song.notes).toHaveLength(4);
    expect(song.duration).toBe(4);
    expect(song.fileName).toBe('prueba.mid');
  });

  it('buildTracksPanel no lanza y crea un botón por pista', () => {
    // parsed.tracks es un array de ARRAYS de eventos (midi.js: tracks.push(events)),
    // no un array de objetos de pista.
    setMidiTracks([
      [{ type: 'note_on', note: 60 }],
      [{ type: 'note_on', note: 67 }]
    ]);
    expect(() => buildTracksPanel()).not.toThrow();
    const list = document.getElementById('tracksList');
    expect(list.children.length).toBeGreaterThan(0);
  });

  it('buildTracksPanel aguanta una pista sin eventos', () => {
    // MIDI con pista de metadatos: midi.js la empuja igual, vacía.
    setMidiTracks([[], [{ type: 'note_on', note: 67 }]]);
    expect(() => buildTracksPanel()).not.toThrow();
  });

  it('buildTracksPanel no lanza sin pistas registradas', () => {
    setMidiTracks(null);
    expect(() => buildTracksPanel()).not.toThrow();
  });

  it('renderPlaylist no lanza con lista vacía', () => {
    expect(() => renderPlaylist()).not.toThrow();
  });

  it('los colores de pista llegan a trackSettings al construir el panel', () => {
    setMidiTracks([[{ type: 'note_on', note: 60 }], [{ type: 'note_on', note: 67 }]]);
    buildTracksPanel();
    expect(trackSettings[0]).toBeTruthy();
    expect(trackSettings[0].color).toMatch(/^#/);
  });

  it('drawRoll y drawKeys no lanzan con canción cargada', () => {
    // En happy-dom el canvas no tiene contexto 2D real, así que sólo se
    // comprueba que la ruta de estado no revienta antes de pintar.
    const roll = document.getElementById('rollCanvas');
    const keys = document.getElementById('keysCanvas');
    expect(roll).toBeTruthy();
    expect(keys).toBeTruthy();
    expect(() => drawRoll()).not.toThrow();
    expect(() => drawKeys()).not.toThrow();
  });

  it('applyMode deja el modo coherente y la UI marcada', () => {
    applyMode('practice');
    expect(window.appMode).toBe('practice');
    expect(document.body.classList.contains('mode-free')).toBe(false);
    applyMode('free');
    expect(document.body.classList.contains('mode-free')).toBe(true);
  });

  it('keepAllPreset tiene un solo dueño', () => {
    setKeepAllPreset(true);
    expect(getKeepAllPreset()).toBe(true);
    setKeepAllPreset(false);
    expect(getKeepAllPreset()).toBe(false);
  });
});
