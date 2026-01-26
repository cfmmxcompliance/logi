
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
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
                target: 'https://www.ventanillaunica.gob.mx',
                changeOrigin: true,
                secure: false, // Ignorar errores de SSL auto-firmados si ocurren
                rewrite: (path) => path.replace(/^\/vucem-proxy/, ''),
                configure: (proxy, _options) => {
                    proxy.on('error', (err, _req, _res) => {
                        console.log('Error en Proxy:', err);
                    });
                    proxy.on('proxyReq', (proxyReq, req, _res) => {
                        // Forzar headers necesarios para SOAP
                        proxyReq.setHeader('Content-Type', 'text/xml;charset=UTF-8');
                    });
                },
            },
        },
    },
});
