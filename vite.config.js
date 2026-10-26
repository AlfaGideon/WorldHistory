import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // `--mode android` builds a classic (non-module) bundle: ES modules cannot be
  // loaded from `file:///android_asset/…` because Chrome applies CORS to module
  // scripts, so the packaged app ships a single plain <script>.
  const android = mode === 'android';

  return {
    plugins: [
      react(),
      android && {
        // The IIFE bundle must be loaded as a classic script: module scripts
        // from file:// are blocked by CORS inside the WebView.
        name: 'worldhistory-classic-script',
        enforce: 'post',
        transformIndexHtml(html) {
          return html
            .replace(/<script type="module"([^>]*)>/g, '<script defer$1>')
            .replace(/(\s)crossorigin(?=[\s>])/g, '$1');
        },
      },
    ].filter(Boolean),
    // Relative asset URLs: the same build runs on the web, from a subpath and
    // from `file:///android_asset/` inside the packaged Android app.
    base: './',
    build: {
      target: 'es2018',
      modulePreload: !android,
      chunkSizeWarningLimit: 1200,
      rollupOptions: android
        ? {
          output: {
            format: 'iife',
            inlineDynamicImports: true,
            entryFileNames: 'assets/app.js',
            chunkFileNames: 'assets/app.js',
            assetFileNames: 'assets/app.[ext]',
          },
        }
        : {
          output: {
            // Rolldown (the bundler shipped with Vite 8) takes chunk groups here.
            advancedChunks: {
              groups: [
                { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
                { name: 'icons', test: /node_modules[\\/]lucide-react[\\/]/ },
              ],
            },
          },
        },
    },
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
  };
});
