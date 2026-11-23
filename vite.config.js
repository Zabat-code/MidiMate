import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    open: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  // Los módulos de la app tocan `document` y `window` al importarse
  // (souten listeners, pintan paneles), así que sin un DOM los tests no
  // pueden ni cargarlos. `happy-dom` es lo más ligero que da ese entorno.
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.js']
  }
})
