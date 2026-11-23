// Defensive SMF Type 0/1 reader. All reads are bounded by their owning chunk.
function fail(message, code = 'MIDI_PARSE_INVALID_FILE') {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function readVarLen(bytes, offset, end) {
  let value = 0;
  for (let i = 0; i < 4; i++) {
    if (offset >= end) fail('Corrupt or truncated MIDI file (VLQ)');
    const b = bytes[offset++];
    value = value * 128 + (b & 0x7f);
    if (!(b & 0x80)) return { value, offset };
  }
  fail('Corrupt MIDI file (VLQ exceeds 4 bytes)');
}

export function parseMidi(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let offset = 0;
  if (bytes.length < 14) fail('Not a valid MIDI file (empty or too short)');
  function str(len) {
    const s = String.fromCharCode(...bytes.subarray(offset, offset + len));
    offset += len;
    return s;
  }
  function u32() {
    const v = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
    offset += 4;
    return v;
  }
  function u16() {
    const v = bytes[offset] * 256 + bytes[offset + 1];
    offset += 2;
    return v;
  }
  if (str(4) !== 'MThd') fail('Not a valid MIDI file');
  const headerLen = u32();
  if (headerLen < 6 || headerLen > bytes.length - 8) fail('Corrupt MIDI header length');
  const format = u16(), ntrks = u16(), division = u16();
  if (format === 2) fail('SMF Type 2 is not supported', 'MIDI_UNSUPPORTED_TYPE_2');
  if (format !== 0 && format !== 1) fail('Unsupported MIDI format');
  if (!ntrks || ntrks > 512) fail('Corrupt MIDI file (unrealistic track count: ' + ntrks + ')');
  if (format === 0 && ntrks !== 1) fail('SMF Type 0 requires exactly one track');
  if (!division) fail('Invalid MIDI division (must not be zero)');
  if (division & 0x8000) fail('SMPTE MIDI division is not supported', 'MIDI_UNSUPPORTED_SMPTE');
  offset = 8 + headerLen;
  const tracks = [];
  for (let t = 0; t < ntrks; t++) {
    if (offset + 8 > bytes.length) fail('Corrupt or truncated MIDI file (missing track)');
    if (str(4) !== 'MTrk') fail('Corrupt MIDI track');
    const trackLen = u32(), trackEnd = offset + trackLen;
    if (trackEnd > bytes.length) fail('Corrupt or truncated MIDI file (track goes past end of file)');
    const events = [];
    let runningStatus = null;
    function requireBytes(count) {
      if (count > trackEnd - offset) fail('Corrupt or truncated MIDI file (event exceeds track)');
    }
    function vlq() {
      const result = readVarLen(bytes, offset, trackEnd);
      offset = result.offset;
      return result.value;
    }
    while (offset < trackEnd) {
      const deltaTicks = vlq();
      requireBytes(1);
      let status = bytes[offset];
      if (status < 0x80) {
        if (runningStatus === null) fail('Invalid MIDI running status');
        status = runningStatus;
      } else {
        offset++;
        runningStatus = status < 0xf0 ? status : null;
      }
      const type = status & 0xf0;
      const ev = { deltaTicks, channel: status & 0x0f };
      if (status === 0xff) {
        requireBytes(1);
        ev.meta = bytes[offset++];
        if (ev.meta > 127) fail('Invalid MIDI metadata type');
        const len = vlq();
        requireBytes(len);
        ev.data = bytes.slice(offset, offset + len);
        offset += len;
        const fixedLengths = { 0x2f: 0, 0x51: 3, 0x58: 4, 0x59: 2 };
        if (ev.meta in fixedLengths && len !== fixedLengths[ev.meta]) fail('Invalid MIDI metadata length');
        if (ev.meta === 0x51) {
          ev.tempo = ev.data[0] * 65536 + ev.data[1] * 256 + ev.data[2];
          if (!ev.tempo) fail('Invalid MIDI tempo (zero)');
        }
        if (ev.meta === 0x2f && offset !== trackEnd) fail('Unexpected MIDI data after end of track');
      } else if (status === 0xf0 || status === 0xf7) {
        const len = vlq();
        requireBytes(len);
        offset += len;
        ev.skip = true;
      } else if (status >= 0x80 && status < 0xf0) {
        const count = type === 0xc0 || type === 0xd0 ? 1 : 2;
        requireBytes(count);
        for (let i = 0; i < count; i++) {
          if (bytes[offset + i] >= 128) fail('Invalid MIDI data byte');
        }
        ev.type = type;
        ev.d1 = bytes[offset++];
        if (count === 2) ev.d2 = bytes[offset++];
      } else fail('Unsupported MIDI system status');
      events.push(ev);
    }
    tracks.push(events);
  }
  return { format, ticksPerBeat: division, tracks };
}

// Build the complete global timeline first, including tempo-only tracks.
export function buildTempoMap(parsed) {
  const tempos = [];
  parsed.tracks.forEach((events, track) => {
    let tick = 0;
    events.forEach((ev, order) => {
      tick += ev.deltaTicks;
      if (ev.tempo !== undefined) tempos.push({ tick, tempo: ev.tempo, track, order });
    });
  });
  tempos.sort((a, b) => a.tick - b.tick || a.track - b.track || a.order - b.order);
  const segments = [{ tick: 0, seconds: 0, tempo: 500000 }];
  for (const ev of tempos) {
    const last = segments[segments.length - 1];
    const seconds = last.seconds + (ev.tick - last.tick) * last.tempo / parsed.ticksPerBeat / 1e6;
    if (ev.tick === last.tick) segments[segments.length - 1] = { ...ev, seconds };
    else segments.push({ ...ev, seconds });
  }
  return segments;
}

export function midiToNotes(parsed) {
  const segments = buildTempoMap(parsed);
  function seconds(tick) {
    let lo = 0, hi = segments.length;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (segments[mid].tick <= tick) lo = mid;
      else hi = mid;
    }
    const s = segments[lo];
    return s.seconds + (tick - s.tick) * s.tempo / parsed.ticksPerBeat / 1e6;
  }
  const canonical = midiToCanonical(parsed);
  parsed.repairs = { danglingNotesClosed: canonical.repairs.danglingNotesClosed };
  const notes = [];
  for (const track of canonical.tracks) {
    for (const ev of track.events) {
      if (ev.type === 'note') notes.push({ note: ev.pitch, start: seconds(ev.start_tick),
        end: seconds(ev.end_tick), velocity: ev.velocity, channel: ev.channel, track: track.index });
    }
  }
  notes.sort((a, b) => a.start - b.start);
  return notes;
}

// Canonical v1: exact integer ticks, FIFO pairing, Latin-1 SMF text.
// Sustain is represented as CC64; note end means key release, not audio decay.
export function midiToCanonical(parsed) {
  let danglingNotesClosed = 0;
  const tracks = parsed.tracks.map((raw, index) => {
    const events = [], active = new Map();
    let tick = 0, name = '';
    for (const ev of raw) {
      tick += ev.deltaTicks;
      const key = ev.channel * 128 + ev.d1;
      if (ev.type === 0x90 && ev.d2 > 0) {
        const note = { type: 'note', channel: ev.channel, pitch: ev.d1, velocity: ev.d2,
          start_tick: tick, end_tick: null };
        events.push(note);
        if (!active.has(key)) active.set(key, { notes: [], head: 0 });
        active.get(key).notes.push(note);
      } else if (ev.type === 0x80 || (ev.type === 0x90 && ev.d2 === 0)) {
        const queue = active.get(key);
        if (queue) {
          queue.notes[queue.head++].end_tick = tick;
          if (queue.head === queue.notes.length) active.delete(key);
        }
      } else if (ev.type === 0xb0) events.push({ type: 'cc', tick, channel: ev.channel, controller: ev.d1, value: ev.d2 });
      else if (ev.type === 0xc0) events.push({ type: 'program_change', tick, channel: ev.channel, program: ev.d1 });
      else if (ev.type === 0xe0) events.push({ type: 'pitch_bend', tick, channel: ev.channel, value: ev.d1 + ev.d2 * 128 - 8192 });
      else if (ev.tempo !== undefined) events.push({ type: 'tempo', tick, microseconds_per_beat: ev.tempo });
      else if (ev.meta === 0x58) events.push({ type: 'time_signature', tick, numerator: ev.data[0], denominator: 2 ** ev.data[1], clocks_per_click: ev.data[2], notated_32nd_notes_per_beat: ev.data[3] });
      else if (ev.meta === 0x59) events.push({ type: 'key_signature', tick, sharps: ev.data[0] > 127 ? ev.data[0] - 256 : ev.data[0], minor: ev.data[1] });
      else if (ev.meta === 0x03 || ev.meta === 0x06) {
        const text = Array.from(ev.data, b => String.fromCharCode(b)).join('');
        events.push({ type: ev.meta === 0x03 ? 'track_name' : 'marker', tick, text });
        if (ev.meta === 0x03 && !name) name = text;
      }
    }
    for (const queue of active.values()) {
      for (let i = queue.head; i < queue.notes.length; i++) {
        queue.notes[i].end_tick = tick;
        danglingNotesClosed++;
      }
    }
    return { index, name, events };
  });
  return { format: parsed.format, ppq: parsed.ticksPerBeat, tracks, repairs: { danglingNotesClosed } };
}
