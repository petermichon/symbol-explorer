import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  build: {
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/typescript/')) return 'typescript';
          if (id.includes('/node_modules/d3/') || id.includes('/node_modules/d3-')) return 'd3';
        },
      },
    },
  },
});
