import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    react() as any,
    tailwindcss() as any
  ],
  base: '/pda/',
  build: {
    outDir: '../dist/pda',
    emptyOutDir: true
  }
});
