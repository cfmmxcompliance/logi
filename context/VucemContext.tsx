
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { VucemConfig } from '../services/vucem/types';
import { vucemStorage } from '../services/vucem/vucemStorage';

interface VucemContextType {
    config: VucemConfig | null;
    setConfig: (config: VucemConfig | null) => void;
    isConfigured: boolean;
    connectionStatus: 'disconnected' | 'testing' | 'online' | 'error';
    lastError: string | null;
    testConnection: () => Promise<boolean>;
    logout: () => Promise<void>;
}

const VucemContext = createContext<VucemContextType | undefined>(undefined);

export const VucemProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [config, setConfig] = useState<VucemConfig | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'testing' | 'online' | 'error'>('disconnected');
    const [lastError, setLastError] = useState<string | null>(null);

    const logout = async () => {
        if (confirm("¿Estás seguro de cerrar la conexión VUCEM? Esto vaciará la memoria y borrará los archivos guardados por seguridad.")) {
            setConfig(null);
            setConnectionStatus('disconnected');
            await vucemStorage.clear();
            window.location.reload();
        }
    };

    const testConnection = async (): Promise<boolean> => {
        if (!config) return false;
        setConnectionStatus('testing');
        setLastError(null);
        try {
            const { vucemService } = await import('../services/vucem/vucemService');
            try {
                await vucemService.consultarEdocument('CHECK_CONNECTION_PING', config);
                setConnectionStatus('online');
                return true;
            } catch (e: any) {
                const msg = e.message || "";
                if (msg.toLowerCase().includes('documento no encontrado') ||
                    msg.toLowerCase().includes('no se encontr') ||
                    msg.toLowerCase().includes('fault')) {
                    setConnectionStatus('online');
                    return true;
                }

                const isAuthError = msg.toLowerCase().includes('auth') ||
                    msg.toLowerCase().includes('password') ||
                    msg.toLowerCase().includes('contraseña') ||
                    msg.toLowerCase().includes('credent') ||
                    msg.toLowerCase().includes('firma');

                setConnectionStatus('error');
                setLastError(msg); // Show the raw message from Vucem
                return false;
            }
        } catch (err: any) {
            setConnectionStatus('error');
            setLastError(err.message || 'Error de conexión desconocido');
            return false;
        }
    };

    useEffect(() => {
        const loadSaved = async () => {
            const meta = vucemStorage.getMeta();
            if (meta && meta.remember) {
                const files = await vucemStorage.getFiles();
                if (files.keyFile && files.cerFile) {
                    setConfig({
                        rfc: meta.rfc,
                        password: meta.password || '',
                        webServicePassword: meta.webServicePassword || '',
                        keyFile: files.keyFile,
                        cerFile: files.cerFile,
                        remember: true
                    });
                }
            }
        };
        loadSaved();
    }, []);

    return (
        <VucemContext.Provider value={{
            config,
            setConfig,
            isConfigured: !!(config?.keyFile && config?.cerFile && config?.password && config?.rfc),
            connectionStatus,
            lastError,
            testConnection,
            logout
        }}>
            {children}
        </VucemContext.Provider>
    );
};

export const useVucem = () => {
    const context = useContext(VucemContext);
    if (!context) throw new Error('useVucem must be used within VucemProvider');
    return context;
};
