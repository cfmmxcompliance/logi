import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

export const NetworkIndicator = () => {
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // No mostrar en pantallas grandes (desktop), solo en dispositivos móviles/PDA
    return (
        <div className="fixed top-2 right-2 z-[9999] pointer-events-none md:hidden">
            {isOnline ? (
                <div className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 backdrop-blur-md px-2 py-1 rounded-full flex items-center gap-1.5 shadow-lg">
                    <Wifi size={12} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Conectado</span>
                </div>
            ) : (
                <div className="bg-red-500/90 text-white border border-red-600 backdrop-blur-md px-2 py-1 rounded-full flex items-center gap-1.5 shadow-lg shadow-red-900/30">
                    <WifiOff size={12} className="animate-pulse" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Sin Red</span>
                </div>
            )}
        </div>
    );
};
