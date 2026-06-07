import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';


export default defineConfig({
  plugins: [
    react()
  ],
  base: '/af-pda/',
  build: {
    outDir: '../dist/af-pda',
    emptyOutDir: true
  }
});
