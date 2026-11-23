/** Bridge between local playback and the resilient backend connection. */
import { midimateAPI } from './api.js';
let integration;
export async function initAPIIntegration(opts = {}) {
  if (integration) return integration;
  const statusEl = document.getElementById('apiConnectionStatus');
  const connectBtn = document.getElementById('btnConnectAPI');
  let receiving = false;
  let backendState = {};
  const remote = fn => data => { receiving = true; try { fn(data); } finally { receiving = false; } };
  const connect = () => midimateAPI.connect().catch(() => {});
  const disconnect = () => midimateAPI.disconnect();
  const labels = { disconnected: '○ Desconectado', connecting: 'Conectando…',
    syncing: 'Sincronizando…', connected: '● Conectado', reconnecting: 'Reconectando…', stale: 'Conexión sin respuesta' };
  midimateAPI.on('connection_state', state => {
    if (['disconnected', 'stale', 'syncing', 'reconnecting'].includes(state)) window.silenceAll?.();
    if (statusEl) {
      statusEl.textContent = labels[state] || state;
      statusEl.style.color = state === 'connected' ? '#44ff88' : '#ffaa00';
    }
    if (connectBtn) {
      const active = state !== 'disconnected';
      connectBtn.textContent = active ? '⏹ Desconectar' : '▶ Conectar API';
      connectBtn.onclick = active ? disconnect : connect;
    }
  });
  const applyState = remote(state => {
    const old = backendState;
    backendState = { ...old, ...state };
    window.__midimate_backend_state = backendState;
    if ('playing' in state && state.playing !== old.playing) window.setPlaybackState?.(state.playing);
  });
  midimateAPI.on('state_response', applyState);
  midimateAPI.on('state_update', applyState);
  midimateAPI.on('note_on', remote(data => {
    if (window.appMode === 'free' || !window.appMode) window.handleNoteOn?.(data.pitch, data.velocity, data.channel);
  }));
  midimateAPI.on('note_off', remote(data => window.handleNoteOff?.(data.pitch, data.channel)));
  midimateAPI.on('transport_play', remote(() => window.setPlaybackState?.(true)));
  midimateAPI.on('transport_stop', remote(() => window.setPlaybackState?.(false)));
  midimateAPI.on('transport_pause', remote(() => window.setPlaybackState?.(false)));
  midimateAPI.on('midi_loaded', data => window.showToast?.(`MIDI cargado: ${data.filename || 'archivo'}`));
  const noteOn = window.handleNoteOn;
  window.handleNoteOn = function(pitch, velocity, channel) {
    noteOn?.apply(this, arguments);
    if (!receiving) midimateAPI.sendNoteOn(pitch, velocity, channel);
  };
  const noteOff = window.handleNoteOff;
  window.handleNoteOff = function(pitch, channel) {
    noteOff?.apply(this, arguments);
    if (!receiving) midimateAPI.sendNoteOff(pitch, channel);
  };
  const playback = window.setPlaybackState;
  window.setPlaybackState = function(playing) {
    playback?.call(this, playing);
    if (!receiving) midimateAPI.sendEvent(playing ? 'transport_play' : 'transport_stop', { position: window.song?.cursorTime || 0 });
  };
  if (connectBtn) connectBtn.onclick = connect;
  integration = { connect, disconnect };
  if (opts.autoConnect) connect();
  return integration;
}
export { midimateAPI };
