import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  base: './', // Use relative paths so assets resolve correctly in subfolders
  plugins: [basicSsl()],
  server: {
    host: true, // Allows access via your local IP address for phone and Meta Quest testing
    port: 5173,
    https: true
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false
  }
});