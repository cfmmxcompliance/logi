// i18n.js — Traducciones ES/EN para la PDA WMS
export const translations = {
    es: {
        // Login
        login_title: 'LogiMaster CFMoto',
        login_subtitle: 'Control de Operaciones Impo/Expo',
        login_email: 'Correo electrónico',
        login_password: 'Contraseña',
        login_btn: 'Iniciar Sesión',
        login_loading: 'Procesando...',
        login_footer: 'Sistema Protegido • Solo Personal Autorizado',
        login_register: '¿Necesitas cuenta? Regístrate',

        // HomeScreen tabs
        tab_overview: 'RESUMEN',
        tab_qa: 'QA',

        // HomeScreen overview
        overview_title: 'Vista en Tiempo Real',
        stat_l1: 'L1 PREP',
        stat_l2: 'L2 ENSAMBLE',
        stat_l3: 'L3 EMPAQUE',
        stat_qa: 'PENDIENTE APROBACIÓN QA',
        units_in: 'Unidades en',
        btn_scan: 'ESCANEAR',
        btn_lookup: 'BUSCAR',

        // Header / logout
        btn_logout: 'Cerrar sesión',

        // ScanScreen
        scan_mode: 'MODO ESCANEO',
        awaiting_scan: 'ESPERANDO ESCANEO',
        scan_placeholder: 'ESCANEA CÓDIGO...',
        label_vin: 'VIN',
        label_product: 'NO. PRODUCTO',
        label_engine: 'NO. MOTOR',
        label_color: 'COLOR',
        label_status: 'ESTATUS',
        label_current: 'ACTUAL',
        label_next: 'SIGUIENTE',
        obs_placeholder: 'Agregar observaciones (opcional)...',
        btn_cancel: 'CANCELAR',
        btn_reject: 'RECHAZAR',
        btn_return_to: 'REGRESAR A',
        btn_approve: 'APROBAR',
        btn_transfer: 'TRANSFERIR',
        requires_qa: 'Requiere Liberación QA',
        processing: 'PROCESANDO...',
        acknowledged: 'ENTERADO',

        // Reentry modal
        reentry_title: 'VEHÍCULO RECHAZADO',
        reentry_subtitle: 'Este vehículo fue previamente retirado por Calidad.',
        reentry_reason_label: 'MOTIVO DEL RECHAZO:',

        // Flash messages
        flash_registered: 'REGISTRADO ✓',
        flash_transferred: 'TRANSFERIDO ✓',
        flash_approved: 'APROBADO ✓\nLIBERADO QA',
        flash_rejected: 'RECHAZADO\nRETIRADO DEL PROCESO',
        flash_returned: 'REGRESADO ✓\nENVIADO A ESTACIÓN ANTERIOR',
        flash_reentered: 'REINGRESADO ✓',

        // LookupScreen
        lookup_title: 'BÚSQUEDA DE VIN',
        lookup_subtitle: 'Buscar en Base de Datos',
        lookup_placeholder: 'Ingresa o escanea VIN...',
        btn_search: 'BUSCAR',
        lookup_history: 'ÚLTIMA TRANSFERENCIA',
        no_history: 'Sin registros de movimientos.',
        searching: 'Buscando...',
        not_found: 'VIN no encontrado.',
        label_entered: 'Ingresó',
        label_location: 'Ubicación',
        label_production_date: 'FECHA DE PRODUCCIÓN',
        label_timestamp: 'FECHA/HORA',
        label_operator_id: 'ID OPERADOR',
        label_observations: 'OBSERVACIONES',
        no_observations: 'Sin observaciones',
    },
    en: {
        // Login
        login_title: 'LogiMaster CFMoto',
        login_subtitle: 'Import/Export Operations Control',
        login_email: 'Email Address',
        login_password: 'Password',
        login_btn: 'Sign In',
        login_loading: 'Processing...',
        login_footer: 'Protected System • Authorized Only',
        login_register: 'Need an account? Register',

        // HomeScreen tabs
        tab_overview: 'OVERVIEW',
        tab_qa: 'QA',

        // HomeScreen overview
        overview_title: 'Real-time Overview',
        stat_l1: 'L1 PREP',
        stat_l2: 'L2 ASSEMBLY',
        stat_l3: 'L3 PACKING',
        stat_qa: 'PENDING QA APPROVAL',
        units_in: 'Units in',
        btn_scan: 'SCAN',
        btn_lookup: 'LOOKUP',

        // Header / logout
        btn_logout: 'Sign out',

        // ScanScreen
        scan_mode: 'SCAN MODE',
        awaiting_scan: 'AWAITING SCAN',
        scan_placeholder: 'SCAN BARCODE...',
        label_vin: 'VIN',
        label_product: 'PRODUCT NO.',
        label_engine: 'ENGINE NO.',
        label_color: 'COLOR',
        label_status: 'STATUS',
        label_current: 'CURRENT',
        label_next: 'NEXT',
        obs_placeholder: 'Add observations (optional)...',
        btn_cancel: 'CANCEL',
        btn_reject: 'REJECT',
        btn_return_to: 'RETURN TO',
        btn_approve: 'APPROVE',
        btn_transfer: 'TRANSFER',
        requires_qa: 'Requires QA Clearance',
        processing: 'PROCESSING...',
        acknowledged: 'ACKNOWLEDGED',

        // Reentry modal
        reentry_title: 'REJECTED VEHICLE',
        reentry_subtitle: 'This vehicle was previously removed by Quality.',
        reentry_reason_label: 'REJECTION REASON:',

        // Flash messages
        flash_registered: 'REGISTERED ✓',
        flash_transferred: 'TRANSFERRED ✓',
        flash_approved: 'APPROVED ✓\nQA CLEARED',
        flash_rejected: 'REJECTED\nREMOVED FROM PROCESS',
        flash_returned: 'RETURNED ✓\nSENT TO PREVIOUS STATION',
        flash_reentered: 'RE-ENTERED ✓',

        // LookupScreen
        lookup_title: 'VIN LOOKUP',
        lookup_subtitle: 'Search Database',
        lookup_placeholder: 'Enter or scan VIN...',
        btn_search: 'SEARCH',
        lookup_history: 'LAST TRANSFER',
        no_history: 'No movement records.',
        searching: 'Searching...',
        not_found: 'VIN not found.',
        label_entered: 'Entered',
        label_location: 'Location',
        label_production_date: 'PRODUCTION DATE',
        label_timestamp: 'TIMESTAMP',
        label_operator_id: 'OPERATOR ID',
        label_observations: 'OBSERVATIONS',
        no_observations: 'No observations',
    }
};

// Hook para usar desde cualquier componente
import { useContext, createContext, useState } from 'react';

const LangContext = createContext();

export function LangProvider({ children }) {
    const [lang, setLang] = useState(() => localStorage.getItem('pda_lang') || 'es');
    const t = (key) => translations[lang][key] || translations['es'][key] || key;
    const toggleLang = () => {
        const next = lang === 'es' ? 'en' : 'es';
        localStorage.setItem('pda_lang', next);
        setLang(next);
    };
    return (
        <LangContext.Provider value={{ lang, t, toggleLang }}>
            {children}
        </LangContext.Provider>
    );
}

export const useLang = () => useContext(LangContext);
