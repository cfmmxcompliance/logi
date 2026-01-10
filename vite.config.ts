import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    optimizeDeps: {
        include: ['pdfjs-dist'],
        esbuildOptions: {
            supported: {
                'top-level-await': true
            },
        },
    },
    build: {
        target: 'esnext'
    },
    server: {
        port: 3000,
        strictPort: true,
        proxy: {
            '/vucem-proxy': {
                target: 'http://www.ventanillaunica.gob.mx',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/vucem-proxy/, ''),
            },
        },
    },
});
