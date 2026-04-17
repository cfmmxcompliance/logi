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
    "col.caja": { es: "Caja", en: "Dry Van" },
    "col.sublinea": { es: "Sub-Línea", en: "Sub-Line" },
    "col.placascaja": { es: "Placas", en: "Plates" },
    "col.lineatransporte": { es: "Línea Transporte", en: "Transport Line" },
    "col.arribo": { es: "Arribo", en: "Arrival" },
    "col.comentariosArribo": { es: "Comentarios Arribo", en: "Arrival Comments" },
    "col.driverid": { es: "Driver ID", en: "Driver ID" },
    "col.driver": { es: "Nombre / Transportista", en: "Name / Carrier" },
    "col.placastracto": { es: "Placas Tracto", en: "Truck License" },
    "col.modelo": { es: "Modelo", en: "Model" },
    "col.sello": { es: "Sello Liberación", en: "Release Seal" },
    "col.cargado": { es: "CARGADO", en: "LOADED" },
    "col.sellado_time": { es: "FECHA/HORA SELLADO", en: "SEALED DATE/TIME" },
    "col.observaciones": { es: "OBSERVACIONES", en: "OBSERVATIONS" },
    
    // Formulario (Modales)
    "form.caja_sec": { es: "Equipo (Caja Seca de 53')", en: "Equipment (53-foot Dry Van)" },
    "form.tracto_sec": { es: "Tracto Camión", en: "Truck Tractor" },

    // Catálogos
    "cajas.num": { es: "Número Caja", en: "Dry Van No." },
    "cajas.carrier": { es: "Carrier Enlace", en: "Linked Carrier" },
    "cajas.linea": { es: "Línea Transporte", en: "Transport Line" },
    "cajas.sublinea": { es: "Sub-Línea", en: "Sub-Line" },
    "cajas.clave": { es: "Clave Ap. 10", en: "App. 10 Code" },
    "cajas.tipo": { es: "Tipo Caja", en: "Type" },
    "cajas.placas": { es: "Placas", en: "License Plates" },
    "driver.name": { es: "Nombre (Driver ID)", en: "Name (Driver ID)" },
    "driver.carrier": { es: "Carrier Padre", en: "Parent Carrier" },
    "driver.linea": { es: "Línea de Transporte", en: "Transport Line" },
    "driver.licencia": { es: "Licencia", en: "License" },
    "driver.tel": { es: "Teléfono", en: "Phone" },
    "driver.placas": { es: "Placas Tracto", en: "Tractor Plates" },
    "tl.id": { es: "Línea ID (Key)", en: "Line ID (Key)" },
    "tl.carrier": { es: "Carrier Padre", en: "Parent Carrier" },
    "tl.sublinea": { es: "Nombre Sub-Línea", en: "Sub-Line Name" },
    "tl.razon": { es: "Razón Social", en: "Legal Name" },
    "tl.mexicana": { es: "Línea Mexicana", en: "Mexican Line" },
    "car.cod": { es: "Código", en: "Code" },
    "car.nombre": { es: "Nombre / Alias", en: "Name / Alias" },
    "car.razon": { es: "Razón Social", en: "Legal Name" },
    "btn.acciones": { es: "Acciones", en: "Actions" },

    // Pre-Alerts
    "pre.status": { es: "Estatus", en: "Status" },
    "pre.file": { es: "Archivo", en: "File" },
    "pre.booking": { es: "Reserva / AWB", en: "Booking / AWB" },
    "pre.containers": { es: "Contenedores (Enc/Esp)", en: "Containers (Found/Expected)" },
    "pre.message": { es: "Mensaje", en: "Message" },
    "pre.mode": { es: "Modalidad", en: "Mode" },
    "pre.model": { es: "Modelo", en: "Model" },
    "pre.etd": { es: "ETD", en: "ETD" },
    "pre.dep_city": { es: "Ciudad Origen", en: "Departure City" },
    "pre.eta": { es: "ETA", en: "ETA" },
    "pre.arr_city": { es: "Ciudad Destino", en: "Arrival City" },
    "pre.invoice": { es: "Factura No", en: "Invoice No" },
    "pre.action": { es: "Acción", en: "Action" },

    // Customs Clearance
    "cust.action": { es: "Acción", en: "Action" },
    "cust.bl": { es: "Número de BL / AWB", en: "BL / AWB Number" },
    "cust.container": { es: "Número de Contenedor", en: "Container Number" },
    "cust.ata": { es: "Ata Port", en: "ATA Port" },
    "cust.pedimento": { es: "Número de Pedimento", en: "Entry / Pedimento number" },
    "cust.key": { es: "Clave", en: "Key" },
    "cust.assigned": { es: "Asignación de revisión", en: "Proforma Revision by:" },
    "cust.target": { es: "Fecha meta de finalización", en: "Target review completion date" },
    "cust.sent": { es: "1er envío de Proforma", en: "Pedimento Proforma Sent" },
    "cust.auth": { es: "Aprobación de Pedimento", en: "Pedimento Authorized" },
    "cust.pece_req": { es: "Fecha solicitud PECE", en: "PECE Request date" },
    "cust.pece_auth": { es: "Fecha autorización PECE", en: "PECE Auth date" },
    "cust.pay": { es: "Fecha de pago Ped.", en: "Pedimento Payment Date" },
    "cust.appoint": { es: "Cita de Despacho", en: "Truck appointment Date" },
    "cust.ata_fac": { es: "ATA Planta", en: "ATA factory" },
    "cust.eir": { es: "Fecha retorno vacío", en: "EIR date" },

    // Equipment Tracking
    "eq.action": { es: "Acción", en: "Action" },
    "eq.proj": { es: "Proyecto / Sección", en: "Project Section" },
    "eq.batch": { es: "Lote de Envío", en: "Shipment Batch" },
    "eq.pic": { es: "Responsable", en: "Person in charge" },
    "eq.loc": { es: "Lugar de descarga", en: "Unloading location" },
    "eq.party": { es: "Responsable descarga", en: "Unloading party" },
    "eq.tools": { es: "Herramientas descarga", en: "Unloading tools" },
    "eq.status": { es: "Estatus", en: "Status" },
    "eq.size": { es: "Tamaño/Tipo de Equipo", en: "Equipment Container Size" },
    "eq.qty": { es: "Cantidad", en: "Container Qty" },
    "eq.container": { es: "Número de Contenedor", en: "Container No." },
    "eq.bl": { es: "Número de BL", en: "BL No." },
    "eq.etd": { es: "ETD (Salida Estimada)", en: "ETD" },
    "eq.atd": { es: "ATD (Salida Real)", en: "ATD" },
    "eq.eta": { es: "ETA (Llegada a Puerto)", en: "ETA Port" },

    // Vessel / Shipment Plan Tracking
    "vt.action": { es: "Acción", en: "Action" },
    "vt.ref": { es: "Número de Ref.", en: "Ref No." },
    "vt.model": { es: "Modelo/Proyecto", en: "Model code / Items Name" },
    "vt.qty": { es: "Cantidad", en: "Qty" },
    "vt.type": { es: "Tipo Proy.", en: "Project types" },
    "vt.contract": { es: "Contrato CF", en: "CF contract No." },
    "vt.invoice": { es: "Factura CF", en: "CF Invoice No." },
    "vt.shipping": { es: "Naviera", en: "Shipping Company" },
    "vt.terminal": { es: "Terminal", en: "Terminal" },
    "vt.bl": { es: "Número de BL", en: "BL No." },
    "vt.container": { es: "Num. Contenedor", en: "Container No." },
    "vt.size": { es: "Tamaño", en: "Container Size" },
    "vt.etd": { es: "ETD Estimado", en: "ETD" },
    "vt.eta": { es: "ETA Puerto", en: "ETA Port" },
    "vt.prealert": { es: "Fecha Pre-Alerta", en: "Pre-Alert Date" },
    "vt.atd": { es: "ATD Real", en: "ATD" },
    "vt.ata": { es: "ATA Puerto", en: "ATA Port" },

    // BOM Analyzer
    "bom.estilo": { es: "ESTILO (Product No.)", en: "STYLE (Product No.)" },
    "bom.modelo": { es: "MODELO", en: "MODEL" },
    "bom.hnos_sin_bom": { es: "Hermanos sin BOM", en: "Siblings without BOM" },
    "bom.prod_sin_bom": { es: "Products sin BOM (por año)", en: "Products without BOM (by year)" },
    "bom.qty": { es: "Cantidad", en: "Qty" },
    "bom.insumo": { es: "INSUMO", en: "INPUT (ITEM)" },
    "bom.cant": { es: "CANTIDAD", en: "QUANTITY" },
    "bom.nota": { es: "NOTA", en: "NOTE" },
    "bom.regimen": { es: "RÉGIMEN", en: "REGIME" },
    "bom.desc": { es: "DESCRIPCIÓN", en: "DESCRIPTION" },
    "bom.cant_detec": { es: "CANTIDADES DETECTADAS", en: "DETECTED QUANTITIES" },
    "bom.estado": { es: "ESTADO", en: "STATUS" },
    "bom.merma": { es: "MERMA", en: "WASTE" },
    "bom.unidad": { es: "UNIDAD", en: "UNIT" },
    "bom.fechaini": { es: "FECHA.INI", en: "START.DATE" },
    "bom.fechafin": { es: "FECHA.FIN", en: "END.DATE" },

    // CI Extractor
    "ci.actions": { es: "Acciones", en: "Actions" },
    "ci.item": { es: "Ítem", en: "Item" },
    "ci.r8diff": { es: "R8 Dif", en: "R8Diff" },
    "ci.estimated": { es: "Estimado", en: "Estimated" },
    "ci.sensible": { es: "Sensible", en: "Sensible" },
    "ci.ndb": { es: "NDB", en: "NDB" },
    "ci.invoice": { es: "Factura", en: "Invoice No" },
    "ci.bl": { es: "BL / Guía", en: "BL" },
    "ci.container": { es: "Contenedor", en: "Container/Guide" },
    "ci.date": { es: "Fecha", en: "Date" },
    "ci.regimen": { es: "Régimen", en: "Regimen" },
    "ci.incoterm": { es: "Incoterm", en: "Incoterm" },
    "ci.hts": { es: "HTS", en: "HTS" },
    "ci.clavesat": { es: "Clave SAT", en: "CLAVESAT" },
    "ci.igi": { es: "IGI", en: "IGI Duty" },
    "ci.prosec": { es: "PROSEC", en: "PROSEC" },
    "ci.r8": { es: "R8", en: "R8" },
    "ci.part": { es: "Num Parte", en: "Part No" },
    "ci.model": { es: "Modelo", en: "Model" },
    "ci.english": { es: "Desc (EN)", en: "English Name" },
    "ci.desc_es": { es: "Desc (ES)", en: "Desc " },
    "ci.qty": { es: "Cant", en: "Qty" },
    "ci.um": { es: "UM", en: "UM" },
    "ci.netwt": { es: "Peso Neto", en: "Net Weight" },
    "ci.totalnetwt": { es: "Peso Neto Tot", en: "Total Net Wt" },
    "ci.unitprice": { es: "P. Unitario", en: "Unit Price" },
    "ci.total": { es: "Total", en: "Total" },
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
