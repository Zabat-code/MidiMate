// ============================================================
// src/playlist-io.js - Exportar/importar configuración + playlist
// ============================================================
import { CFG, DEFAULTS, STORAGE_KEY } from './config.js';
import { playlist } from './playlist-store.js';
import { showToast } from './controls/playback.js';

export function initPlaylistIO(){
  const btnExport = document.getElementById('btnConfigExportJson');
  const btnImport = document.getElementById('btnConfigImportJson');
  const input = document.getElementById('configImportJsonFile');
  if (!btnExport || !btnImport || !input) return;

  btnExport.addEventListener('click', ()=>{
    try{
      const data = { version:1, exportedAt:new Date().toISOString(), config:CFG, playlist:playlist };
      const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'midimate-config-playlist.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 15000);
      showToast('Configuración y lista exportadas');
    }catch(e){ showToast('No se pudo exportar: '+e.message); }
  });

  btnImport.addEventListener('click', ()=> input.click());
  input.addEventListener('change', e=>{
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      try{
        const data = JSON.parse(reader.result);
        if (!data || !Array.isArray(data.playlist)) throw new Error('Archivo no válido');
        const merged = JSON.parse(JSON.stringify(DEFAULTS));
        Object.assign(merged, data.config||{});
        playlist.splice(0, playlist.length, ...data.playlist);
        merged.playlist = data.playlist;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        showToast('Importado. Recargando…');
        setTimeout(()=> location.reload(), 500);
      }catch(err){ showToast('No se pudo importar: '+err.message); }
    };
    reader.onerror = ()=> showToast('No se pudo leer el archivo');
    reader.readAsText(file);
  });
}
