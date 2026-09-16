import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * HEAD de este repo al arrancar el servidor o compilar. La memoria que exporta
 * un módulo declarativo lo lleva en `meta.origen.commit`: dice con qué versión
 * de la aplicación se instanció la genérica. `scripts/lib/motor.mjs` inyecta el
 * mismo valor al compilar para Node.
 */
function commitActual(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'desconocido';
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    'import.meta.env.VITE_COMMIT': JSON.stringify(commitActual()),
  },
  server: {
    /**
     * El canvas de proyecto (`/proyecto/<slug>`) lee del servidor local del
     * harness: `python -m harness.servidor`, que escucha en 127.0.0.1:8787 y
     * sólo responde GET.
     *
     * Va por proxy y no por fetch a `http://127.0.0.1:8787` directo para que
     * todo quede en el mismo origen: así el servidor del harness no necesita
     * CORS, que es una cabecera que después cuesta quitar.
     */
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: false,
      },
    },
  },
});
