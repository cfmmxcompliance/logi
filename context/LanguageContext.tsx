import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';

type Language = 'es' | 'en';

interface Translations {
    [key: string]: {
        es: string;
        en: string;
    };
}

export const translations: Translations = {
    // Menú Principal y Títulos Operativos
    "menu.cajas": { es: "Catálogo de Cajas Secas 53'", en: "53-foot Dry Van Catalog" },
    "menu.asignaciones": { es: "Asignación Diaria de Cajas", en: "Daily 53' Dry Van Assignment" },
    "menu.drivers": { es: "Directorio de Choferes", en: "Drivers Directory" },
    "menu.líneas": { es: "Líneas de Tracto Camión", en: "Truck Tractor Lines" },
    "menu.carriers": { es: "Catálogo de Transportistas", en: "Carriers Catalog" },
    "menu.dashboard": { es: "Dashboard", en: "Dashboard" },
    "menu.plan": { es: "Shipment Plan", en: "Shipment Plan" },
    "menu.prealerts": { es: "Pre-Alerts", en: "Pre-Alerts" },
    "menu.tracking": { es: "Tracking", en: "Tracking" },
    "menu.equipment": { es: "Equipment", en: "Equipment" },
    "menu.customs": { es: "Customs Clearance", en: "Customs Clearance" },
    "menu.ciextractor": { es: "CI Extractor", en: "CI Extractor" },
    "menu.ai": { es: "Asistente IA", en: "AI Assistant" },
    
    // Módulo de Asignaciones Diarias Específico
    "asig.title": { es: "Asignación Diaria de Cajas Secas 53'", en: "Daily 53-foot Dry Van Assignment" },
    "asig.subtitle": { es: "Gestión operativa vinculando Cajas Secas 53' y Transportistas activos.", en: "Operational management linking 53' Dry Vans and active Carriers." },
    "btn.new": { es: "Asignar", en: "Assign" },
    "btn.export": { es: "Exportar", en: "Export" },
    "btn.mass": { es: "Filtros Masivos", en: "Mass Filters" },
    "col.fecha": { es: "Fecha/Hora", en: "Date/Time" },
    "col.operacion": { es: "No. Operación", en: "Operation No." },
    "col.caja": { es: "Número Caja Seca 53'", en: "53' Dry Van Number" },
    "col.sublinea": { es: "Sub-Línea", en: "Sub-Line" },
    "col.placascaja": { es: "Placas Caja Seca", en: "Dry Van License Plate" },
    "col.driverid": { es: "Driver ID", en: "Driver ID" },
    "col.driver": { es: "Nombre / Transportista", en: "Name / Carrier" },
    "col.placastracto": { es: "Placas Tracto Camión", en: "Truck Tractor License" },
    "col.modelo": { es: "Modelo", en: "Model" },
    "col.sello": { es: "Sello Liberación", en: "Release Seal" },
    "col.cargado": { es: "CARGADO", en: "LOADED" },
    "col.sellado_time": { es: "FECHA/HORA SELLADO", en: "SEALED DATE/TIME" },
    "col.observaciones": { es: "OBSERVACIONES", en: "OBSERVATIONS" },
    
    // Formulario (Modales)
    "form.caja_sec": { es: "Equipo (Caja Seca de 53')", en: "Equipment (53-foot Dry Van)" },
    "form.tracto_sec": { es: "Tracto Camión", en: "Truck Tractor" },
};

interface LanguageContextProps {
    language: Language;
    toggleLanguage: () => void;
    t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [language, setLanguage] = useState<Language>(() => {
        return (localStorage.getItem('logi_lang') as Language) || 'es';
    });

    useEffect(() => {
        localStorage.setItem('logi_lang', language);
    }, [language]);

    const toggleLanguage = () => {
        setLanguage(prev => (prev === 'es' ? 'en' : 'es'));
    };

    const t = (key: string): string => {
        const entry = translations[key];
        if (!entry) return key; // Fallback al key si no existe traducción
        return entry[language];
    };

    return (
        <LanguageContext.Provider value={{ language, toggleLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
};

export const useLanguage = (): LanguageContextProps => {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
};
