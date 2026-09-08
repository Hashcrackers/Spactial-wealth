import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
    plugins: [basicSsl()],
    server: {
        host: true, // Allows access via your local IP address for phone and Meta Quest testing
        port: 5173,
        https: true
    }
});