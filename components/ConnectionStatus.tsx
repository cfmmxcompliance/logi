import React, { useState, useEffect } from 'react';
import { Database, WifiOff } from 'lucide-react';

export const ConnectionStatus: React.FC = () => {
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

    return (
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors shadow-sm ${isOnline
            ? 'bg-orange-50 text-orange-700 border-orange-200'
            : 'bg-red-50 text-red-700 border-red-200 animate-pulse'
            }`}
            title={isOnline ? "Connected to Firebase Cloud" : "No Internet Connection"}
        >
            {isOnline ? <Database size={14} /> : <WifiOff size={14} />}
            <span>{isOnline ? 'Firebase Cloud' : 'Offline'}</span>
        </div>
    );
};
