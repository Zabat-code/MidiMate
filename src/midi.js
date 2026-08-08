// ============================================================
// src/midi.js - MIDI file parser
// ============================================================

function readVarLen(bytes, offset) {
  let value = 0, b;
  do {
    b = bytes[offset++];
    value = (value << 7) | (b & 0x7f);
  } while (b & 0x80);
  return { value, offset };
}

export function parseMidi(buffer) {
  const bytes = new Uint8Array(buffer);
  let offset = 0;

  // Early validation: a too-short or binary-garbage file can make the parser
  // read out of range or hang reading meaningless giant "tracks". Better to
  // reject it with a clear message before attempting to parse anything.
  if (!bytes || bytes.length < 14) {
    throw new Error('Not a valid MIDI file (empty or too short)');
  }

  function str(len) {
    let s = '';
    for (let i = 0; i < len; i++) s += String.fromCharCode(bytes[offset + i]);
    offset += len;
    return s;
  }
  function u32() {
    const v = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
    offset += 4;
    return v >>> 0;
  }
  function u16() {
    const v = (bytes[offset] << 8) | bytes[offset + 1];
    offset += 2;
    return v;
  }

  if (str(4) !== 'MThd') throw new Error('Not a valid MIDI file');
  const headerLen = u32();
  const format = u16();
  const ntrks = u16();
  const division = u16();
  if (ntrks > 512) throw new Error('Corrupt MIDI file (unrealistic track count: ' + ntrks + ')');
  offset += (headerLen - 6);
  let ticksPerBeat = division & 0x7fff;
  if (!ticksPerBeat || ticksPerBeat <= 0) ticksPerBeat = 480; // valor de respaldo razonable

  const tracks = [];
  for (let t = 0; t < ntrks; t++) {
    if (offset + 8 > bytes.length) throw new Error('Corrupt or truncated MIDI file (missing track ' + (t + 1) + ' of ' + ntrks + ')');
    if (str(4) !== 'MTrk') throw new Error('Corrupt MIDI track');
    const trackLen = u32();
    const trackEnd = offset + trackLen;
    if (trackEnd > bytes.length) throw new Error('Corrupt or truncated MIDI file (track ' + (t + 1) + ' goes past end of file)');
    const events = [];
    let runningStatus = null;

    while (offset < trackEnd) {
      const dt = readVarLen(bytes, offset);
      offset = dt.offset;
      let status = bytes[offset];
      if (status < 0x80) {
        status = runningStatus;
      } else {
        offset++;
        runningStatus = status;
      }
      const type = status & 0xf0;
      const channel = status & 0x0f;
      let ev = { deltaTicks: dt.value, channel };

      if (status === 0xFF) {
        const metaType = bytes[offset++];
        const len = readVarLen(bytes, offset);
        offset = len.offset;
        const data = bytes.slice(offset, offset + len.value);
        offset += len.value;
        ev.meta = metaType;
        ev.data = data;
        if (metaType === 0x51 && data.length === 3) {
          ev.tempo = (data[0] << 16) | (data[1] << 8) | data[2];
        }
      } else if (status === 0xF0 || status === 0xF7) {
        const len = readVarLen(bytes, offset);
        offset = len.offset;
        offset += len.value;
        ev.skip = true;
      } else if (type === 0x80 || type === 0x90 || type === 0xA0 || type === 0xB0 || type === 0xE0) {
        ev.type = type;
        ev.d1 = bytes[offset++];
        ev.d2 = bytes[offset++];
      } else if (type === 0xC0 || type === 0xD0) {
        ev.type = type;
        ev.d1 = bytes[offset++];
      } else {
        offset++;
      }
      events.push(ev);
    }
    offset = trackEnd;
    tracks.push(events);
  }
  return { format, ticksPerBeat, tracks };
}

export function midiToNotes(parsed) {
  const { ticksPerBeat, tracks } = parsed;
  const merged = [];
  tracks.forEach((events, trackIdx) => {
    let tick = 0;
    events.forEach(ev => {
      tick += ev.deltaTicks;
      merged.push({ ...ev, tick, trackIdx });
    });
  });
  merged.sort((a, b) => a.tick - b.tick);

  let tempo = 500000,
    lastTick = 0,
    lastSeconds = 0;
  const notes = [];
  const active = {};

  merged.forEach(ev => {
    const deltaTicks = ev.tick - lastTick;
    lastSeconds += (deltaTicks / ticksPerBeat) * (tempo / 1000000);
    lastTick = ev.tick;
    if (ev.tempo !== undefined) tempo = ev.tempo;

    if (ev.type === 0x90 && ev.d2 > 0) {
      const key = ev.trackIdx + '|' + ev.channel + '|' + ev.d1;
      active[key] = { start: lastSeconds, velocity: ev.d2 };
    } else if (ev.type === 0x80 || (ev.type === 0x90 && ev.d2 === 0)) {
      const key = ev.trackIdx + '|' + ev.channel + '|' + ev.d1;
      const on = active[key];
      if (on) {
        notes.push({
          note: ev.d1,
          start: on.start,
          end: lastSeconds,
          velocity: on.velocity,
          channel: ev.channel,
          track: ev.trackIdx
        });
        delete active[key];
      }
    }
  });
  notes.sort((a, b) => a.start - b.start);
  return notes;
}