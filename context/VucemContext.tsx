
import React, { createContext, useContext, useState, ReactNode } from 'react';
import { VucemConfig } from '../services/vucem/types';

interface VucemContextType {
    config: VucemConfig | null;
    setConfig: (config: VucemConfig | null) => void;
    isConfigured: boolean;
}

const VucemContext = createContext<VucemContextType | undefined>(undefined);

export const VucemProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [config, setConfig] = useState<VucemConfig | null>(null);

    return (
        <VucemContext.Provider value={{
            config,
            setConfig,
            isConfigured: !!(config?.keyFile && config?.cerFile && config?.password && config?.webServicePassword)
        }}>
            {children}
        </VucemContext.Provider>
    );
};

export const useVucem = () => {
    const context = useContext(VucemContext);
    if (!context) {
        throw new Error('useVucem must be used within a VucemProvider');
    }
    return context;
};
