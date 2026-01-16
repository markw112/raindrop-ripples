import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    open: true
  },
  build: {
    target: 'esnext',
    // Disable minification entirely to preserve Function.toString() for faustwasm AudioWorklet
    minify: false
  },
  assetsInclude: ['**/*.wasm']
});
