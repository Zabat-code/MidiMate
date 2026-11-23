import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { MidiMateAPI } from '../api.js';
class Socket {
  static OPEN = 1;
  static all = [];
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; Socket.all.push(this); }
  open() { this.readyState = 1; this.onopen(); }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.onclose?.(); }
  event(type, sequence, payload = {}, event_id = 'e' + sequence) {
    this.onmessage({ data: JSON.stringify({ type, sequence, payload, event_id }) });
  }
}
describe('API resilience', () => {
  let api;
  beforeEach(() => {
    vi.useFakeTimers(); vi.stubGlobal('WebSocket', Socket); Socket.all = [];
    api = new MidiMateAPI('https://localhost:8000');
  });
  afterEach(() => { api.disconnect(); vi.useRealTimers(); vi.unstubAllGlobals(); });
  async function connect() {
    const promise = api.connect(); const ws = Socket.all.at(-1);
    ws.open(); ws.event('state_response', 1, { playing: false }); await promise; return ws;
  }
  it('uses correct secure route and waits for state sync', async () => {
    const promise = api.connect(); const ws = Socket.all[0];
    expect(ws.url).toBe('wss://localhost:8000/api/midimate/ws');
    ws.open(); expect(api.connected).toBe(false);
    ws.event('state_response', 1, { tempo: 95 }); await promise;
    expect(api.state.tempo).toBe(95); expect(api.connectionState).toBe('connected');
  });
  it('deduplicates and requests resync after a gap', async () => {
    const ws = await connect(); const handler = vi.fn(); api.on('note_on', handler);
    ws.event('note_on', 2, { pitch: 60 }); ws.event('note_on', 2, { pitch: 60 });
    ws.event('note_on', 1, { pitch: 62 }, 'late');
    expect(handler).toHaveBeenCalledTimes(1);
    ws.event('state_update', 4, { playing: true });
    expect(api.connectionState).toBe('syncing');
    expect(ws.sent.at(-1).type).toBe('state_request');
    ws.event('state_response', 5, { playing: true }); expect(api.state.playing).toBe(true);
  });
  it('reconnects with exponential backoff and accepts a restarted sequence', async () => {
    const ws = await connect(); ws.event('state_update', 2, { tempo: 90 }); ws.close();
    expect(api.reconnectDelay).toBe(2000);
    await vi.advanceTimersByTimeAsync(1250);
    const next = Socket.all.at(-1); next.open(); next.event('state_response', 1, { tempo: 120 });
    await Promise.resolve(); expect(api.state.tempo).toBe(120); expect(api.reconnectDelay).toBe(1000);
  });
  it('detects heartbeat loss after sleep and manual disconnect stops retries', async () => {
    const ws = await connect(); await vi.advanceTimersByTimeAsync(30000);
    expect(ws.readyState).toBe(3);
    api.disconnect(); const count = Socket.all.length;
    await vi.advanceTimersByTimeAsync(60000); expect(Socket.all).toHaveLength(count);
  });
  it('retries REST with the same command identity', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetch);
    const promise = api.transport('play'); await vi.advanceTimersByTimeAsync(500); await promise;
    expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.request_id).toBeTruthy(); expect(body.idempotency_key).toBeTruthy(); expect(body.job_id).toBeTruthy();
  });
});

describe('integration bridge', () => {
  it('connects on the first click and never echoes remote notes', async () => {
    const { midimateAPI } = await import('../api.js');
    const { initAPIIntegration } = await import('../api-integration.js');
    document.body.innerHTML = '<button id="btnConnectAPI"></button><span id="apiConnectionStatus"></span>';
    const connect = vi.spyOn(midimateAPI, 'connect').mockResolvedValue();
    const send = vi.spyOn(midimateAPI, 'sendNoteOn').mockReturnValue(true);
    const original = vi.fn(); window.handleNoteOn = original;
    const silence = vi.fn(); window.silenceAll = silence;
    const bridge = await initAPIIntegration();
    document.getElementById('btnConnectAPI').click();
    expect(connect).toHaveBeenCalledTimes(1);
    midimateAPI._emit('note_on', { pitch: 60, velocity: 90, channel: 0 });
    expect(original).toHaveBeenCalledTimes(1); expect(send).not.toHaveBeenCalled();
    window.handleNoteOn(62, 100, 0); expect(send).toHaveBeenCalledOnce();
    midimateAPI._emit("connection_state", "syncing");
    expect(silence).toHaveBeenCalledOnce();
    expect(await initAPIIntegration()).toBe(bridge);
    connect.mockRestore(); send.mockRestore();
  });
});
