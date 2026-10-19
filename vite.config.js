import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001' },
      '/socket': { target: 'ws://localhost:3001', ws: true }
    }
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 750,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'vendor-three';
          if (id.includes('node_modules/@react-three')) return 'vendor-r3f';
          if (id.includes('node_modules/viem')) return 'vendor-viem';
          if (id.includes('node_modules/@farcaster')) return 'vendor-farcaster';
          if (id.includes('node_modules/react') || id.includes('node_modules/lucide-react')) return 'vendor-ui';
        }
      }
    }
  }
});
