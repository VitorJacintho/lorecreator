import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' para o build funcionar carregado pelo protocolo app:// do Electron
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5180 },
  // app desktop: o tamanho do bundle não importa tanto
  build: { chunkSizeWarningLimit: 1500 },
});
