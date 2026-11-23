import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  playlist, currentPlaylistIndex, setCurrentPlaylistIndex,
  setPlaylistAdvanceHandler, advanceToNextPlaylistTrack
} from '../playlist-store.js';
import { initReportButton, registrarTodas } from '../report.js';

describe('playlist-store es la única fuente del estado de la lista', () => {
  beforeEach(() => {
    playlist.splice(0, playlist.length);
    setCurrentPlaylistIndex(-1);
  });

  it('el índice se lee siempre fresco, no desde una copia global', () => {
    // Antes main.js publicaba window.currentPlaylistIndex = -1 una sola vez y
    // nada lo refrescaba: en cuanto cambiabas de pista, quien leía el global
    // veía el índice inicial. Aquí el binding vivo siempre es el real.
    setCurrentPlaylistIndex(3);
    expect(currentPlaylistIndex).toBe(3);
    setCurrentPlaylistIndex(0);
    expect(currentPlaylistIndex).toBe(0);
  });

  it('mutar la lista se refleja en la misma referencia', () => {
    playlist.push({ name: 'a' }, { name: 'b' });
    expect(playlist).toHaveLength(2);
    playlist.splice(0, playlist.length);
    expect(playlist).toHaveLength(0);
  });

  it('advanceToNextPlaylistTrack delega en el handler registrado', () => {
    playlist.push({ name: 'a' }, { name: 'b' });
    const spy = vi.fn();
    setPlaylistAdvanceHandler(spy);
    advanceToNextPlaylistTrack();
    expect(spy).toHaveBeenCalledTimes(1);

    // Sin playlist no debe llamar a nadie.
    playlist.splice(0, playlist.length);
    advanceToNextPlaylistTrack();
    expect(spy).toHaveBeenCalledTimes(1);
    setPlaylistAdvanceHandler(null);
  });

  it('sin handler registrado no lanza', () => {
    playlist.push({ name: 'a' });
    setPlaylistAdvanceHandler(null);
    expect(() => advanceToNextPlaylistTrack()).not.toThrow();
  });
});

describe('el botón de reporte se enlaza una sola vez', () => {
  beforeEach(() => {
    document.body.innerHTML = '<button id="btnReporte"></button>';
  });

  it('llamar dos veces a initReportButton no duplica la descarga', () => {
    // main.js (init) y drawer.js (initDrawerEvents) lo llamaban los dos, así
    // que el botón acababa con dos listeners y cada clic descargaba el TXT dos
    // veces. Sin idempotencia, dos descargas.
    const created = [];
    const origCreate = URL.createObjectURL;
    URL.createObjectURL = (blob) => { created.push(blob); return origCreate ? origCreate(blob) : 'blob:test'; };
    const origClick = HTMLAnchorElement.prototype.click;
    let clicks = 0;
    HTMLAnchorElement.prototype.click = function () { clicks++; };

    try {
      registrarTodas();
      initReportButton();
      initReportButton();
      initReportButton();
      document.getElementById('btnReporte').click();
      expect(created).toHaveLength(1);
      expect(clicks).toBe(1);
    } finally {
      URL.createObjectURL = origCreate;
      HTMLAnchorElement.prototype.click = origClick;
    }
  });

  it('el reporte generado lista funciones registradas', async () => {
    registrarTodas();

    const blobs = [];
    const origCreate = URL.createObjectURL;
    const origClick = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = (blob) => { blobs.push(blob); return 'blob:test'; };
    HTMLAnchorElement.prototype.click = function () {};

    try {
      initReportButton();
      document.getElementById('btnReporte').click();
      expect(blobs).toHaveLength(1);
      const text = await blobs[0].text();
      // El duplicado muerto de playlist.js leía window._funcionesRegistro, que
      // nadie publica, así que su informe salía con el catálogo vacío.
      expect(text).toContain('FUNCTION CATALOG');
      expect(text).toContain('registrarFuncion');
      expect(text).toMatch(/Total funciones registradas: [1-9]\d*/);
    } finally {
      URL.createObjectURL = origCreate;
      HTMLAnchorElement.prototype.click = origClick;
    }
  });
});
