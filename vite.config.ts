
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react(), nodePolyfills()],
    optimizeDeps: {
        include: ['pdfjs-dist', 'exceljs'],
        esbuildOptions: {
            supported: {
                'top-level-await': true
            },
        },
    },
    build: {
        target: 'es2019',  // Compatible con Android Chrome 80+ (gama baja)
        rollupOptions: {
            output: {
                manualChunks: {
                    'vendor-react': ['react', 'react-dom', 'react-router-dom'],
                    'vendor-firebase': ['firebase/app', 'firebase/firestore', 'firebase/auth', 'firebase/storage'],
                    'vendor-pdf': ['pdfjs-dist'],
                    'vendor-excel': ['exceljs'],
                }
            }
        }
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
