import { describe, it, expect } from 'vitest';
import { parseMidi, midiToNotes } from '../midi.js';

// Builds a minimal valid MIDI file (format 0, 1 track, 96 ticks/beat):
// note 60 (middle C) sounding for 96 ticks (half a second at 120 BPM).
function buildMinimalMidi() {
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96];
  const track = [
    0x00, 0x90, 60, 100, // delta 0, Note On ch0 nota60 vel100
    0x60, 0x80, 60, 0,   // delta 96, Note Off ch0 nota60
    0x00, 0xff, 0x2f, 0x00 // delta 0, End Of Track
  ];
  const trackHeader = [0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, track.length];
  return new Uint8Array([...header, ...trackHeader, ...track]).buffer;
}

describe('parseMidi', () => {
  it('parses a minimal valid MIDI file', () => {
    const parsed = parseMidi(buildMinimalMidi());
    expect(parsed.ticksPerBeat).toBe(96);
    expect(parsed.tracks.length).toBe(1);
    expect(parsed.tracks[0].length).toBe(3);
  });

  it('rejects a file that is not MIDI, with a clear message', () => {
    const notMidi = new TextEncoder().encode('esto no es un midi, es texto plano').buffer;
    expect(() => parseMidi(notMidi)).toThrow(/not a valid midi file/i);
  });

  it('rejects an empty or too-short file', () => {
    const empty = new Uint8Array(3).buffer;
    expect(() => parseMidi(empty)).toThrow();
  });

  it('rejects a track whose declared size goes outside the file (truncated)', () => {
    const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96];
    const trackHeader = [0x4d, 0x54, 0x72, 0x6b, 0, 0, 0x03, 0xe8];
    const buf = new Uint8Array([...header, ...trackHeader, 0, 0x90, 60]).buffer;
    expect(() => parseMidi(buf)).toThrow(/corrupt or truncated midi file/i);
  });

  it('doesn\'t hang or crash with an absurd number of tracks', () => {
    const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0xff, 0xff, 0, 96];
    const buf = new Uint8Array(header).buffer;
    expect(() => parseMidi(buf)).toThrow(/unrealistic track count/i);
  });
});

describe('midiToNotes', () => {
  it('convierte un MIDI parseado a notas con el timing correcto', () => {
    const parsed = parseMidi(buildMinimalMidi());
    const notes = midiToNotes(parsed);
    expect(notes.length).toBe(1);
    expect(notes[0].note).toBe(60);
    expect(notes[0].start).toBeCloseTo(0);
    expect(notes[0].end).toBeCloseTo(0.5, 2);
  });

  it('doesn\'t crash if ticksPerBeat arrives at 0 (uses a fallback value)', () => {
    const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 0];
    const track = [0x00, 0xff, 0x2f, 0x00];
    const trackHeader = [0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, track.length];
    const buf = new Uint8Array([...header, ...trackHeader, ...track]).buffer;
    const parsed = parseMidi(buf);
    expect(parsed.ticksPerBeat).toBeGreaterThan(0);
  });
});
