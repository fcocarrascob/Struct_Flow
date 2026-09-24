import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { pluginObras } from './servidor/obras.mjs';

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
  // `pluginObras` sirve las carpetas de obra en `/obras-api`, dentro del mismo
  // servidor: sin proxy ni CORS.
  plugins: [react(), tailwindcss(), pluginObras()],
  define: {
    'import.meta.env.VITE_COMMIT': JSON.stringify(commitActual()),
  },
  server: {
    proxy: {
      /**
       * El puente de Flow con SAP2000 (`npm run puente-sap`, 127.0.0.1:8789).
       * Es de este repo, no del harness: la aplicación habla con SAP sin que el
       * asistente esté corriendo. Va por proxy para que todo quede en el mismo
       * origen y el puente no necesite CORS.
       */
      '/sap-api': {
        target: 'http://127.0.0.1:8789',
        changeOrigin: false,
        rewrite: (ruta) => ruta.replace(/^\/sap-api/, ''),
      },
    },
  },
});
