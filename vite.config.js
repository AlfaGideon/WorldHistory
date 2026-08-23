import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      // Важно: именно 127.0.0.1, а не localhost. На Windows localhost часто
      // резолвится в IPv6 ::1, а backend слушает только 127.0.0.1 — из-за
      // этого прокси возвращал 502.
      '/api': 'http://127.0.0.1:3001',
    },
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
