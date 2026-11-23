import { describe, it, expect } from 'vitest';
import { parseMidi, midiToNotes, midiToCanonical } from '../midi.js';

function file(tracks, { format = tracks.length === 1 ? 0 : 1, division = 96, headerLen = 6 } = {}) {
  const u32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  return new Uint8Array([77,84,104,100,...u32(headerLen),0,format,0,tracks.length,division >> 8,division & 255,
    ...tracks.flatMap(t => [77,84,114,107,...u32(t.length),...t])]);
}
const end = [0,255,47,0];

describe('defensive SMF bounds', () => {
  it.each([0,5,0xffffffff])('rejects header length %s', headerLen => {
    expect(() => parseMidi(file([end], {headerLen}))).toThrow(/header length/);
  });
  it('rejects zero tracks', () => expect(() => parseMidi(file([], {format:1}))).toThrow(/track count/));
  it('rejects Type 2 with a stable code', () => {
    expect(() => parseMidi(file([end],{format:2}))).toThrow(/Type 2/);
    try { parseMidi(file([end],{format:2})); } catch(e) { expect(e.code).toBe('MIDI_UNSUPPORTED_TYPE_2'); }
  });
  it('rejects SMPTE explicitly', () => expect(() => parseMidi(file([end],{division:0xe728}))).toThrow(/SMPTE/));
  it.each([
    [0x80], [0x81,0x80,0x80,0x80,0], [0], [0,60,100], [0,0x90,60],
    [0,0xc0], [0,0x90,60,0x90], [0,255], [0,255,1,5,65], [0,0xf0,5,1],
    [0,255,0x51,2,1,2], [0,255,0x51,3,0,0,0], [0,0xf1,1],
    [0,0x90,60,64,0,255,1,0,0,60,0],
    [0,0x90,60,64,0,0xf0,0,0,60,0]
  ])('rejects invalid event %j', (...raw) => {
    expect(() => parseMidi(file([raw]))).toThrow();
  });
  it('does not borrow a missing event byte from the next track', () => {
    expect(() => parseMidi(file([[0,0x90,60],end]))).toThrow(/event exceeds track/);
  });
  it('accepts a four byte VLQ and valid SysEx', () => {
    const parsed = parseMidi(file([[0xff,0xff,0xff,0x7f,0xf0,2,1,0xf7,...end]]));
    expect(parsed.tracks[0][0].deltaTicks).toBe(0xfffffff);
  });
  it('accepts running channel status and velocity-zero note-off', () => {
    const notes = midiToNotes(parseMidi(file([[0,0x90,60,100,96,60,0,...end]])));
    expect(notes[0].end).toBe(0.5);
  });
  it('pairs overlapping pitches FIFO and keeps channels distinct', () => {
    const parsed = parseMidi(file([[0,0x90,60,10,0,0x91,60,30,24,0x90,60,20,24,0x80,60,0,24,0x80,60,0,24,0x81,60,0,...end]]));
    const notes = midiToNotes(parsed);
    expect(notes.map(n => [n.velocity,n.end])).toEqual([[10,0.25],[30,0.5],[20,0.375]]);
  });
  it('closes pending notes at their track end and counts repairs', () => {
    const parsed = parseMidi(file([[0,0x92,60,100,96,255,47,0],[0,0x90,67,80,0,255,47,0]]));
    const notes = midiToNotes(parsed);
    expect(notes.map(n => n.end)).toEqual([0.5,0]);
    expect(parsed.repairs.danglingNotesClosed).toBe(2);
    expect(midiToCanonical(parsed).repairs.danglingNotesClosed).toBe(2);
  });
  it('converts notes with a complete tempo map from a later separate track', () => {
    const parsed = parseMidi(file([
      [0,0x90,60,64,0x82,0x20,0x80,60,0,...end], // 288 ticks
      [0,255,81,3,7,161,32,96,255,81,3,6,138,27,96,255,81,3,10,44,43,...end]
    ]));
    expect(midiToNotes(parsed)[0].end).toBeCloseTo(0.5+0.428571+0.666667,9);
  });
});
