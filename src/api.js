/** Resilient local MidiForge REST and realtime client. */
const DEFAULT_URL = 'http://localhost:8000';
const uid = () => globalThis.crypto.randomUUID();
export class MidiMateAPI {
  constructor(baseUrl = DEFAULT_URL, { token = '' } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
    this.ws = null;
    this.listeners = new Map();
    this.clientId = 'midimate_' + uid();
    this.connected = false;
    this.connectionState = 'disconnected';
    this.reconnectDelay = 1000;
    this._reconnectTimer = null;
    this._heartbeatTimer = null;
    this._manual = false;
    this._seen = new Set();
    this._incoming = 0;
    this._outgoing = 0;
    this._lastReceived = 0;
    this.state = {};
  }
  _status(state) {
    this.connectionState = state;
    this._emit('connection_state', state);
  }
  commandIdentity() {
    return { request_id: uid(), idempotency_key: uid(), job_id: uid() };
  }
  async command(path, payload, identity = this.commandIdentity()) {
    // One identity and one serialized body survive all transient retries.
    const body = JSON.stringify({ ...payload, ...identity });
    for (let attempt = 0; ; attempt++) {
      let response;
      try {
        response = await fetch(this.baseUrl + path, {
          method: 'POST', headers: { 'Content-Type': 'application/json',
            ...(this.token ? { Authorization: 'Bearer ' + this.token } : {}) }, body,
          signal: AbortSignal.timeout(30000),
        });
      } catch (error) {
        if (attempt >= 2) throw error;
        await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
        continue;
      }
      const result = await response.json();
      if (!response.ok) {
        const error = new Error(result.error?.message || `HTTP ${response.status}`);
        error.code = result.error?.code;
        error.recoverable = result.error?.recoverable;
        throw error;
      }
      return result;
    }
  }
  async getState() {
    const response = await fetch(this.baseUrl + '/api/midimate/state', {
      headers: this.token ? { Authorization: 'Bearer ' + this.token } : {},
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }
  transport(action, position = 0) { return this.command('/api/midimate/transport', { action, position }); }
  noteOn(pitch, velocity = 100, channel = 0) { return this._noteEvent(pitch, velocity, channel); }
  noteOff(pitch, channel = 0) { return this._noteEvent(pitch, 0, channel); }
  _noteEvent(pitch, velocity, channel) { return this.command('/api/midimate/note', { pitch, velocity, channel }); }
  connect() {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return this._connecting || Promise.resolve();
    this._manual = false;
    clearTimeout(this._reconnectTimer);
    this._status('connecting');
    const url = new URL(this.baseUrl + '/api/midimate/ws');
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    // Browsers cannot attach Authorization headers to WebSocket handshakes.
    // LAN clients authenticate via a subprotocol, avoiding URL/token logs.
    const protocols = this.token ? ['midiforja', 'bearer.' + this.token] : undefined;
    const ws = new WebSocket(url.toString(), protocols);
    this.ws = ws;
    this._incoming = this._outgoing = 0;
    this._seen.clear();
    this._connecting = new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => { reject(new Error('WS handshake timeout')); ws.close(); }, 10000);
      ws.onopen = () => {
        if (this.ws !== ws || this._manual) { ws.close(); return; }
        this._lastReceived = Date.now();
        ws.send(JSON.stringify({ client_id: this.clientId, client_type: 'midimate' }));
        this._status('syncing');
        clearInterval(this._heartbeatTimer);
        this._heartbeatTimer = setInterval(() => {
          if (Date.now() - this._lastReceived > 25000) {
            this._status('stale');
            ws.close();
          } else this.sendEvent('ping', { ts: Date.now() });
        }, 10000);
      };
      ws.onmessage = ({ data }) => {
        if (this.ws !== ws) return;
        let msg;
        try { msg = JSON.parse(data); } catch { return; }
        const type = msg.type || msg.event;
        const payload = msg.payload ?? msg.data;
        if (!msg.event_id || !Number.isInteger(msg.sequence) || msg.sequence <= 0) return;
        this._lastReceived = Date.now();
        if (this._seen.has(msg.event_id) || msg.sequence <= this._incoming) return;
        this._seen.add(msg.event_id);
        if (this._seen.size > 1000) this._seen.delete(this._seen.values().next().value);
        if (type !== 'state_response' && msg.sequence !== this._incoming + 1) {
          this._incoming = msg.sequence;
          this._status('syncing');
          this.requestState();
          return;
        }
        this._incoming = msg.sequence;
        if (type === 'state_response') {
          this.state = { ...payload };
          this.connected = true;
          this.reconnectDelay = 1000;
          this._status('connected');
          if (!settled) {
            settled = true; clearTimeout(timeout);
            this._emit('connected', {}); resolve();
          }
        } else if (type === 'state_update') this.state = { ...this.state, ...payload };
        this._emit(type, payload);
      };
      ws.onclose = () => {
        clearTimeout(timeout);
        if (!settled) { settled = true; reject(new Error('WS closed before state sync')); }
        if (this.ws !== ws) return;
        clearInterval(this._heartbeatTimer);
        this.ws = null;
        this.connected = false;
        this._emit('disconnected', {});
        this._status('disconnected');
        if (!this._manual) this._scheduleReconnect();
      };
      ws.onerror = () => { this._emit('error', { code: 'WS_CONNECTION_FAILED' }); ws.close(); };
    });
    return this._connecting;
  }
  disconnect() {
    this._manual = true;
    clearTimeout(this._reconnectTimer);
    clearInterval(this._heartbeatTimer);
    const ws = this.ws;
    this.ws = null;
    this.connected = false;
    ws?.close();
    this._status('disconnected');
    this._emit('disconnected', {});
  }
  _scheduleReconnect() {
    if (this._manual) return;
    clearTimeout(this._reconnectTimer);
    this._status('reconnecting');
    const delay = this.reconnectDelay * (0.8 + Math.random() * 0.4);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
    this._reconnectTimer = setTimeout(() => this.connect().catch(() => {}), delay);
  }
  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }
  off(event, handler) { this.listeners.get(event)?.delete(handler); }
  _emit(event, data) {
    for (const handler of this.listeners.get(event) || []) {
      try { handler(data); } catch (error) { console.error(error); }
    }
  }
  sendEvent(type, payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    const control = ['ping', 'pong', 'state_request'].includes(type);
    if (!control && this.connectionState !== 'connected') return false;
    this.ws.send(JSON.stringify({ type, payload, event_id: uid(),
      sequence: control ? this._outgoing : ++this._outgoing, timestamp: Date.now() / 1000 }));
    return true;
  }
  sendNoteOn(pitch, velocity = 100, channel = 0) { return this.sendEvent('note_on', { pitch, velocity, channel }); }
  sendNoteOff(pitch, channel = 0) { return this.sendEvent('note_off', { pitch, velocity: 0, channel }); }
  requestState() { return this.sendEvent('state_request', {}); }
  updateState(partial) { return this.sendEvent('state_update', partial); }
}
export const midimateAPI = new MidiMateAPI();
export default MidiMateAPI;
