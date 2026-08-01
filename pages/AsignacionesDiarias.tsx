import React, { useState, useEffect, useMemo, useRef } from 'react';
import { asignacionCajaService } from '../services/asignacionCajaService';
import { ccpNotificationService } from '../services/ccpNotificationService';
import { cajaService } from '../services/cajaService';
import { driverService } from '../services/driverService';
import { carrierService } from '../services/carrierService';
import { contratoService } from '../services/contratoService.ts';
import { liberacionService } from '../services/liberacionService';
import { transportLineService } from '../services/transportLineService';
import { vigilanciaService } from '../services/vigilanciaService';
import { citasConfigService } from '../services/citasConfigService';
import { AsignacionCajaModel } from '../types/asignacionCaja';
import { CajaModel } from '../types/caja';
import { DriverModel } from '../types/driver';
import { CarrierModel } from '../types/carrier';
import { TransportLineModel } from '../types/transportLine';
import { LiberacionRecord, LiberacionDockRecord, SelloRecord } from '../types';
import { VigilanciaRecord } from '../types/vigilancia';
import { Plus, Edit2, Trash2, Search, Filter, Calendar, Download, UploadCloud, FileSpreadsheet, Truck, Navigation, Container, Box, XCircle, CheckCircle, ChevronUp, ChevronDown, RefreshCw, FileText, Loader2, Shield, AlertTriangle, Clock } from 'lucide-react';
import { liberacionDockService } from '../services/liberacionDockService';
import { selloService } from '../services/selloService';
import { uploadFileToDrive } from '../services/googleDriveService.ts';
import { CatalogQueryBuilder, QueryCondition, evaluateCondition } from '../components/CatalogQueryBuilder';
import { SearchableComboBox, ComboOption } from '../components/SearchableComboBox';
import { MultiSearchableComboBox } from '../components/MultiSearchableComboBox';
import { parseCSV } from '../utils/csvHelpers';
import { useAuth } from '../context/useAuth';
import { UserRole } from '../types';
import modelosCaja from '../utils/modelosCaja.json';
import { useLanguage } from '../context/LanguageContext';
import { SelloMismatchAlert } from '../components/SelloMismatchAlert';
import BarcodePanelModal from '../components/BarcodePanelModal';
import { CitasConfigModal } from '../components/CitasConfigModal';
import * as XLSX from 'xlsx';

// Helper: obtiene la fecha de hoy en zona horaria de México (evita brinco de fecha después de 6PM)
const getMexicoToday = () => {
  const now = new Date();
  const mx = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Monterrey', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return mx; // Returns 'YYYY-MM-DD'
};

const getMexicoDateString = () => {
  const mxDate = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" }));
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${mxDate.getFullYear()}-${pad(mxDate.getMonth() + 1)}-${pad(mxDate.getDate())}`;
};

// Hora actual en zona Monterrey — formato HH:MM
const getMexicoNow = () =>
  new Date().toLocaleTimeString('en-GB', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit' });

const getAllSlotsForDate = (fecha: string, configOverrides: Record<string, number> = {}) => {
  const baseHours = (fecha || '') >= '2026-07-07'
    ? ["07:30","08:00","08:30","09:00","09:30","10:00","10:30","11:00","12:00","13:00","14:00","15:00"]
    : ["07:00","08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00"];
    
  let allSlots = baseHours;
  if (fecha === '2026-07-07') allSlots = [...baseHours, "15:30", "16:00", "18:30"];
  else if (fecha === '2026-07-08') allSlots = [...baseHours, "16:00", "17:00"];
  else if (fecha === '2026-07-14') allSlots = [...baseHours, "16:00", "17:00", "18:00"];
  else if (fecha === '2026-07-15') allSlots = [...baseHours, "16:00", "17:00"];
  else if (fecha === '2026-07-20') allSlots = [...baseHours, "16:00", "18:00"];
  else if (fecha === '2026-07-22') allSlots = [...baseHours, "16:00", "17:00"];
  else if ((fecha || '') >= '2026-07-09') {
    const d = new Date(fecha + 'T12:00:00');
    const day = d.getDay();
    if (day === 0) { // Domingo (no hay citas)
      allSlots = [];
    } else if (day >= 1 && day <= 4) { // Lunes a Jueves (hasta 17:00)
      allSlots = [...baseHours, "16:00", "17:00"];
    } else if (day === 5) { // Viernes (hasta 15:00)
      allSlots = [...baseHours];
    } else if (day === 6) { // Sábado (hasta 14:00)
      allSlots = baseHours.filter(h => h <= '14:00');
    }
  }

  return Array.from(new Set([...allSlots, ...Object.keys(configOverrides)])).sort();
};

const resolveToSlot = (time: string, slots: string[]): string => {
  const sorted = [...slots].sort();
  let resolved = sorted[0];
  for (const s of sorted) { if (s <= time) resolved = s; }
  return resolved;
};

// Algoritmo de Cascada para asegurar que no se exceda el maxSlots por adelantamientos
const calculateWaterfallOccupancy = (fecha: string, asignacionesDia: any[], dayConfig: any, useNewSchedule: boolean) => {
  const allSlotsForDate = getAllSlotsForDate(fecha, dayConfig);
  const isCanceled = (val: string) => val === 'RECHAZADO' || val === 'DROP' || val === 'NO SHOW' || val === 'CANCELED' || val === 'CANCELADO';
  
  const activeAsignaciones = asignacionesDia.filter(a => !isCanceled((a.dockArribo || '').trim().toUpperCase()));
  
  const sortedAsig = [...activeAsignaciones].sort((a, b) => {
    const timeA = (a.arribo || a.horaAsignacion) || '';
    const timeB = (b.arribo || b.horaAsignacion) || '';
    return timeA.localeCompare(timeB);
  });

  const slotOccupancy: Record<string, number> = {};
  allSlotsForDate.forEach(s => slotOccupancy[s] = 0);

  const getMaxSlots = (s: string) => {
    return dayConfig[s] !== undefined 
      ? dayConfig[s] 
      : (s === '11:00' ? 0 
         : (s === '15:00' && fecha === '2026-07-06') ? 8
         : (fecha === '2026-07-14' && (s === '17:00' || s === '18:00')) ? 1
         : (fecha === '2026-07-15' && s === '17:00') ? 6
         : (fecha === '2026-07-22' && s === '17:00') ? 2
         : 6);
  };

  const onTime: any[] = [];
  const early: any[] = [];
  const late: any[] = [];

  for (const asig of activeAsignaciones) {
    let original = resolveToSlot(asig.horaAsignacion || '', allSlotsForDate);
    if (!useNewSchedule) {
      original = (asig.horaAsignacion || '').substring(0, 2) + ':00';
    }
    
    if (!asig.arribo) {
      onTime.push({ asig, original });
      continue;
    }
    
    let target = resolveToSlot(asig.arribo, allSlotsForDate);
    if (!useNewSchedule) {
      target = asig.arribo.substring(0, 2) + ':00';
    }

    if (target === original) {
      onTime.push({ asig, original });
    } else if (target < original) {
      early.push({ asig, target, original });
    } else {
      late.push({ asig, target, original });
    }
  }

  // 1. Asignar On-Time (tienen prioridad en su horario)
  for (const item of onTime) {
    if (slotOccupancy[item.original] === undefined) slotOccupancy[item.original] = 0;
    slotOccupancy[item.original]++;
  }

  // 2. Asignar Early (ordenados por arribo)
  early.sort((a, b) => (a.asig.arribo || '').localeCompare(b.asig.arribo || ''));
  for (const item of early) {
    let assigned = false;
    const startIndex = allSlotsForDate.indexOf(item.target);
    const endIndex = allSlotsForDate.indexOf(item.original);
    
    if (startIndex !== -1 && endIndex !== -1) {
      for (let i = startIndex; i < endIndex; i++) {
        const s = allSlotsForDate[i];
        if (slotOccupancy[s] < getMaxSlots(s)) {
          slotOccupancy[s]++;
          assigned = true;
          break;
        }
      }
    }
    
    if (!assigned) {
      if (slotOccupancy[item.original] === undefined) slotOccupancy[item.original] = 0;
      slotOccupancy[item.original]++;
    }
  }

  // 3. Asignar Late (ordenados por arribo)
  late.sort((a, b) => (a.asig.arribo || '').localeCompare(b.asig.arribo || ''));
  for (const item of late) {
    let assigned = false;
    const startIndex = allSlotsForDate.indexOf(item.target);
    
    if (startIndex !== -1) {
      for (let i = startIndex; i < allSlotsForDate.length; i++) {
        const s = allSlotsForDate[i];
        if (slotOccupancy[s] < getMaxSlots(s)) {
          slotOccupancy[s]++;
          assigned = true;
          break;
        }
      }
    }
    
    if (!assigned) {
      const fallback = item.target || allSlotsForDate[allSlotsForDate.length - 1];
      if (slotOccupancy[fallback] === undefined) slotOccupancy[fallback] = 0;
      slotOccupancy[fallback]++;
    }
  }

  return slotOccupancy;
};

export const AsignacionesDiarias: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  // Roles con acceso de solo lectura — sin botones de escritura
  const currentRole = (user?.role || '').toUpperCase();
  const isReadOnly = currentRole === 'EMBARQUES' || currentRole === 'CLIENTE';
  const isEmbarques = isReadOnly;
  const scacFilter = currentRole === 'CARRIER' ? (user?.scac || '').trim().toUpperCase() : null;
  const subLineaFilter = currentRole === 'TRANSPORTISTA' ? (user?.scac || '').trim().toUpperCase() : null;
  const [asignaciones, setAsignaciones] = useState<AsignacionCajaModel[]>([]);
  const [cajas, setCajas] = useState<CajaModel[]>([]);
  const [drivers, setDrivers] = useState<DriverModel[]>([]);
  const [carriers, setCarriers] = useState<CarrierModel[]>([]);
  const [transportLines, setTransportLines] = useState<TransportLineModel[]>([]);
  const [liberaciones, setLiberaciones] = useState<LiberacionRecord[]>([]);
  const [liberacionesDock, setLiberacionesDock] = useState<LiberacionDockRecord[]>([]);
  const [vigilancias, setVigilancias] = useState<VigilanciaRecord[]>([]);
  const [sellos, setSellos] = useState<SelloRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [citasConfig, setCitasConfig] = useState<Record<string, Record<string, number>>>({});
  const [showCitasModal, setShowCitasModal] = useState(false);
  const [importErrors, setImportErrors] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<Partial<AsignacionCajaModel>>({ 
    fecha: getMexicoDateString(),
    horaAsignacion: ''
  });
  const [isEditing, setIsEditing] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [cancelModal, setCancelModal] = useState<{ ids: string[]; reason: string } | null>(null);
  const [showDuplicateTLModal, setShowDuplicateTLModal] = useState(false);
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [tableFixed, setTableFixed] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);
  const [mismatchAlert, setMismatchAlert] = useState<{
    numeroCaja: string;
    selloOriginal: string;
    selloLiberacion: string;
  } | null>(null);

  // Popup de códigos de barras
  const [barcodeTarget, setBarcodeTarget] = useState<{
    numeroOperacion: string;
    numeroCaja: string;
    sello: string;
  } | null>(null);

  // Batch manual close
  const [isBatchClosing, setIsBatchClosing] = useState(false);
  const [batchResult, setBatchResult] = useState<{ ok: number; err: number } | null>(null);

  // Search & Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [cargadoFilter, setCargadoFilter] = useState<'ALL' | 'PENDIENTES' | 'LLEGADOS' | 'CERRADO' | 'CANCELADO'>('ALL');
  const today = getMexicoDateString();
  const savedRange = (() => { try { return JSON.parse(localStorage.getItem('asig_dateRange') || 'null'); } catch { return null; } })();
  const [dateRange, setDateRange] = useState({ 
    start: savedRange?.start || today, 
    end: savedRange?.end || today 
  });
  const [isMassQueryOpen, setIsMassQueryOpen] = useState(false);
  const [queryConditions, setQueryConditions] = useState<QueryCondition[]>([
      { id: '1', column: 'numeroCaja', operator: 'in', type: 'string', input: '' }
  ]);
  const [activeMassQuery, setActiveMassQuery] = useState<QueryCondition[] | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const ASIG_DOCS_FOLDER_ID = '1ETyhI2Zddsw_btLBMIQGcYfhkrsmIEQj';
  const [uploadingFor, setUploadingFor] = useState<{ id: string; field: 'layoutUrl' | 'ccpUrl' | 'anexo29Url' } | null>(null);

  // Converts a Drive webViewLink to a direct download URL
  const toDriveDownload = (viewUrl: string) => {
    const match = viewUrl.match(/\/d\/([^/]+)\//);  
    return match ? `https://drive.google.com/uc?export=download&id=${match[1]}` : viewUrl;
  };

  const handleUploadDoc = async (recordId: string, field: 'layoutUrl' | 'ccpUrl' | 'anexo29Url', file: File, numeroCaja: string) => {
    try {
      setUploadingFor({ id: recordId, field });

      const labelMap: Record<string, string> = { layoutUrl: 'LAYOUT', ccpUrl: 'CCP', anexo29Url: 'ANEXO29' };
      const label = labelMap[field] || field.toUpperCase();
      const ext = file.name.split('.').pop() || 'file';
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${label}_${numeroCaja}_${ts}.${ext}`;

      // ── 1. SUBIR A DRIVE ────────────────────────────────────────────────────
      const result = await uploadFileToDrive(file, filename, ASIG_DOCS_FOLDER_ID);
      const url = result?.webViewLink || '';
      const uploadedBy = user?.email || 'sistema';
      const uploadedAt = new Date().toISOString();

      // Extracción robusta del fileId (soporta todos los formatos de URL de Drive)
      const extractId = (u: string) => {
        if (!u) return '';
        const parts = u.split('/d/');
        if (parts.length > 1) return parts[1].split(/[/?#]/)[0];
        const m = u.match(/[?&]id=([\w-]+)/);
        return m ? m[1] : '';
      };
      const driveFileId = result?.id || (result as any)?.fileId || extractId(url);

      if (field === 'layoutUrl') {
        // ── 2. LOGGING + OBTENER fileId ────────────────────────────────────
        console.log('[Layout] Upload result:', JSON.stringify({ id: result?.id, fileId: (result as any)?.fileId, webViewLink: result?.webViewLink, name: result?.name }));
        console.log('[Layout] url guardado:', url);
        console.log('[Layout] driveFileId resuelto:', driveFileId || '(VACÍO — revisa consola)');

        // ── 3. LEER DESDE DRIVE VÍA GAS ────────────────────────────────────
        let cfmRef = '';
        let vehiculos = '';
        if (driveFileId) {
          try {
            const GAS_READ = 'https://script.google.com/macros/s/AKfycbzX3ctF0kOxbw2M4uHbkPp8gsIy-EMQX64M5IEzMHTQs0gUxR-7BOx9BMe2RVEFKeWh/exec';
            const gasResp = await fetch(`${GAS_READ}?action=readFile&fileId=${driveFileId}`);
            const gasJson = await gasResp.json() as any;

            // cfmRef desde el nombre del archivo en Drive
            if (gasJson.name) {
              const rawName = gasJson.name.replace(/\.[^/.]+$/, '');
              const pi = rawName.toUpperCase().indexOf('LAY OUT CCP_');
              if (pi !== -1) cfmRef = rawName.substring(pi + 12).trim();
            }
            // vehiculos desde D27
            if (gasJson.content) {
              const { read } = await import('xlsx');
              const wb = read(gasJson.content, { type: 'base64' });
              const sheet = wb.Sheets[wb.SheetNames[0]];
              if (sheet['D27']?.v !== undefined) vehiculos = String(sheet['D27'].v).trim();
            }
            console.log('[Layout] GAS — cfmRef:', cfmRef || '(vacío)', '| D27:', vehiculos || '(vacío)');
          } catch (gasErr) {
            console.warn('[Layout] GAS readFile error:', gasErr);
          }
        }

        // cfmRef fallback desde nombre del archivo local si GAS falla
        if (!cfmRef && file.name) {
          const rawName = file.name.replace(/\.[^/.]+$/, '');
          const pi = rawName.toUpperCase().indexOf('LAY OUT CCP_');
          if (pi !== -1) cfmRef = rawName.substring(pi + 12).trim();
        }

        // ── 4. GUARDAR EN FIREBASE ──────────────────────────────────────────
        const layoutUpdates: any = {
          layoutUrl: url,
          layoutUploadedBy: uploadedBy,
          layoutUploadedAt: uploadedAt,
          layoutFileName: file.name,
          layoutFileId: driveFileId,
          ...(cfmRef    ? { cfmRef }    : {}),
          ...(vehiculos ? { vehiculos } : {}),
        };

        await asignacionCajaService.updateAsignacion(recordId, layoutUpdates);
        setAsignaciones(prev => prev.map(a => a.id === recordId ? { ...a, ...layoutUpdates } : a));
        if (cfmRef) {
          const { storageService } = await import('../services/storageService');
          await storageService.upsertHistoricoExpos([{ id: `exp_${recordId}`, cfmRef } as any]);
        }

        // Sincronizar con Embarques (contratos)
        const asigRecord = asignaciones.find(a => a.id === recordId);
        if (asigRecord && asigRecord.numeroOperacion) {
          const contratoDoc = await contratoService.getContratoByNumeroOperacion(asigRecord.numeroOperacion, asigRecord.fecha);
          if (contratoDoc && contratoDoc.id) {
            await contratoService.updateContrato(contratoDoc.id, {
              layoutUrl: url,
              layoutUploadedBy: uploadedBy,
              layoutUploadedAt: uploadedAt,
              layoutFileName: file.name,
            });
          }
        }

      } else if (field === 'ccpUrl') {
        const ccpUpdates = { 
          ccpUrl: url, 
          ccpUploadedBy: uploadedBy, 
          ccpUploadedAt: uploadedAt,
          ccpFileName: file.name,
          ccpFileId: driveFileId
        };
        await asignacionCajaService.updateAsignacion(recordId, ccpUpdates);
        // Trigger notification
        const asigDoc = asignaciones.find(a => a.id === recordId);
        if (asigDoc) {
          const tlName = (asigDoc as any).numeroOperacion || 'Sin Operación';
          const subLineaName = (asigDoc as any).subLinea || 'Desconocido';
          const carrierDisplay = `${tlName} / ${subLineaName}`;
          await ccpNotificationService.addNotification(carrierDisplay, numeroCaja);
          
          // Sincronizar con Embarques (contratos)
          if (asigDoc.numeroOperacion) {
            const contratoDoc = await contratoService.getContratoByNumeroOperacion(asigDoc.numeroOperacion, asigDoc.fecha);
            if (contratoDoc && contratoDoc.id) {
              await contratoService.updateContrato(contratoDoc.id, {
                ccpUrl: url,
                ccpUploadedBy: uploadedBy,
                ccpUploadedAt: uploadedAt,
                ccpFileName: file.name,
              });
            }
          }
        }
        setAsignaciones(prev => prev.map(a => a.id === recordId ? { ...a, ...ccpUpdates } : a));
      } else {
        await asignacionCajaService.updateAsignacion(recordId, { anexo29Url: url, anexo29UploadedBy: uploadedBy, anexo29UploadedAt: uploadedAt });
        setAsignaciones(prev => prev.map(a => a.id === recordId ? { ...a, anexo29Url: url, anexo29UploadedBy: uploadedBy, anexo29UploadedAt: uploadedAt } : a));
      }

      window.dispatchEvent(new Event('reserva:changed'));
    } catch (e: any) {
      alert(`Error subiendo archivo: ${e.message}`);
    } finally {
      setUploadingFor(null);
      window.dispatchEvent(new Event('reserva:changed'));
    }
  };

  const columns = ['fecha', 'horaAsignacion', 'numeroOperacion', 'numeroCaja', 'subLinea', 'placasCaja', 'transportLineId', 'driverId', 'nombreDriver', 'placasTracto', 'modeloAsignado', 'carrierCodigo', 'observaciones', 'arribo', 'dockArribo', 'cfmRef', 'vehiculos'];

  useEffect(() => {
    loadData();

    const handleRefresh = () => {
      loadData();
    };
    window.addEventListener('data:refresh', handleRefresh);
    window.addEventListener('reserva:changed', handleRefresh);

    return () => {
      window.removeEventListener('data:refresh', handleRefresh);
      window.removeEventListener('reserva:changed', handleRefresh);
    };
  }, [dateRange.start, dateRange.end]);

  // TRANSPORTISTA: si transportLines carga DESPUES de abrir el modal, auto-rellena el carrier
  useEffect(() => {
    if (showModal && !isEditing && subLineaFilter && !formData.carrierCodigo && transportLines.length > 0) {
      const matchingTL = transportLines.find(
        tl => (tl.TransportLine || '').toLowerCase() === subLineaFilter.toLowerCase()
      );
      if (matchingTL?.carrierCodigo) {
        setFormData(prev => ({ ...prev, carrierCodigo: matchingTL.carrierCodigo }));
      }
    }
  }, [showModal, isEditing, subLineaFilter, transportLines]);

  // Auto-marca workingWasAvailable en Firebase cuando se cumple la condición por primera vez
  useEffect(() => {
    const now = Date.now();
    asignaciones.forEach(a => {
      if (a.workingWasAvailable) return; // ya marcado
      const exactSello = sellos.find(s => s.asignacionCajaId === a.id);
      const selloRow = exactSello || sellos.find(s => s.numeroCaja === a.numeroCaja && s.fechaAsignacion === a.fecha);
      const lib = liberaciones.find(l => l.asignacionCajaId === a.id);
      const hasBc = !!(lib?.selloValidado || selloRow?.selloAsignado);
      if (!hasBc) return;
      if ((a as any).arribo || (a as any).dockArribo) return; // ya tiene llegada o dock
      if (!a.fecha || !a.horaAsignacion) return;
      const appt = new Date(`${a.fecha}T${a.horaAsignacion}:00`);
      const minPast = (now - appt.getTime()) / (1000 * 60);
      if (minPast > 60 && a.id) {
        asignacionCajaService.updateAsignacion(a.id, { workingWasAvailable: true });
      }
    });
  }, [asignaciones, sellos, liberaciones]);

  const loadData = async () => {
    try {
        const [asigData, cajasData, driversData, carriersData, liberacionesData, liberacionesDockData, linesData, vigilanciasData, sellosData, citasConfigData] = await Promise.all([
            asignacionCajaService.getAsignacionesByDateRange(dateRange.start, dateRange.end).catch(() => []),
            cajaService.getAllCajas().catch(() => []),
            driverService.getAllDrivers().catch(() => []),
            carrierService.getAllCarriers().catch(() => []),
            liberacionService.getLiberacionesByDateRange(dateRange.start, dateRange.end).catch(() => []),
            liberacionDockService.getLiberacionesDockByDateRange(dateRange.start, dateRange.end).catch(() => []),
            transportLineService.getAllTransportLines().catch(() => []),
            vigilanciaService.getByDateRange(dateRange.start, dateRange.end).catch(() => []),
            selloService.getAllSellos().catch(() => []),
            citasConfigService.getCitasConfigByDateRange(dateRange.start, dateRange.end).catch(() => ({}))
        ]);
        setAsignaciones(asigData.sort((a,b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()));
        setCajas(cajasData);
        setDrivers(driversData);
        setCarriers(carriersData);
        setLiberaciones(liberacionesData);
        setLiberacionesDock(liberacionesDockData);
        setTransportLines(linesData);
        setVigilancias(vigilanciasData);
        setSellos(sellosData);
        setCitasConfig(citasConfigData);
        // ── Auto-fill scac + customId for records missing them ──────────────
        // Runs silently in background after data loads, no await needed
        (async () => {
          const toFix = asigData.filter(a => {
            const tl = linesData.find(l => l.transportLineId === (a as any).transportLineId);
            const resolvedScac = tl?.TransportLine || '';
            if (!resolvedScac) return false;          // can't resolve → skip
            const datePart = ((a as any).fecha || '').replace(/-/g, '');
            const expectedId = `${(a as any).numeroOperacion || ''}${datePart}${(a as any).carrierCodigo || ''}${resolvedScac}`;
            return !(a as any).scac || (a as any).customId !== expectedId;
          });
          for (const a of toFix) {
            const tl = linesData.find(l => l.transportLineId === (a as any).transportLineId);
            const resolvedScac = tl?.TransportLine || '';
            const datePart = ((a as any).fecha || '').replace(/-/g, '');
            const newCustomId = `${(a as any).numeroOperacion || ''}${datePart}${(a as any).carrierCodigo || ''}${resolvedScac}`;
            try {
              await asignacionCajaService.updateAsignacion(a.id!, { scac: resolvedScac, customId: newCustomId } as any);
            } catch { /* silent */ }
          }
        })();
        // ─────────────────────────────────────────────────────────────────────
    } catch (e) {
        console.error("Error cargando dependencias de Asignación:", e);
    } finally {
        setLoading(false);
        window.dispatchEvent(new Event('reserva:changed'));
    }
  };

  const { filteredData, filterCounts } = useMemo(() => {
    let result = asignaciones;

    // CARRIER role: only show assignments for their SCAC
    if (scacFilter) {
        result = result.filter(a => (a.carrierCodigo || '').toUpperCase() === scacFilter);
    }

    // TRANSPORTISTA role: filter by carrierCodigo linked to their Nombre Comercial (TransportLine)
    // Same approach as Cajas and Drivers: use carrierCodigo as the reliable link field.
    if (currentRole === 'TRANSPORTISTA') {
        if (!subLineaFilter) {
            result = [];
        } else {
            // Find all transportLineIds that belong to this TransportLine (Nombre Comercial)
            const matchingTLs = new Set(
                transportLines
                    .filter(tl => (tl.TransportLine || '').toLowerCase() === subLineaFilter.toLowerCase())
                    .map(tl => tl.transportLineId)
                    .filter(Boolean)
            );
            
            result = result.filter(a => {
                const matchesId = a.transportLineId && matchingTLs.has(a.transportLineId);
                const matchesName = (a.subLinea || '').toLowerCase() === subLineaFilter.toLowerCase();
                return matchesId || matchesName;
            });
        }
    }

    // Date Range Filter
    if (dateRange.start) {
        result = result.filter(a => a.fecha >= dateRange.start);
    }
    if (dateRange.end) {
        result = result.filter(a => a.fecha <= dateRange.end);
    }

    // Multi-term search (spaces/commas)
    if (searchTerm) {
        const terms = searchTerm.toLowerCase().split(/[\s,]+/).filter(t => t);
        result = result.filter(a => 
            terms.every(term => 
                (a.numeroOperacion || '').toLowerCase().includes(term) ||
                (a.numeroCaja || '').toLowerCase().includes(term) ||
                (a.subLinea || '').toLowerCase().includes(term) ||
                (a.placasCaja || '').toLowerCase().includes(term) ||
                (a.driverId || '').toLowerCase().includes(term) ||
                (a.nombreDriver || '').toLowerCase().includes(term) ||
                (a.placasTracto || '').toLowerCase().includes(term) ||
                (a.carrierCodigo || '').toLowerCase().includes(term) ||
                (a.modeloAsignado || '').toLowerCase().includes(term) ||
                (a.observaciones || '').toLowerCase().includes(term) ||
                (a.fecha || '').toLowerCase().includes(term) ||
                ((a as any).arribo || '').toLowerCase().includes(term) ||
                ((a as any).dockArribo || '').toLowerCase().includes(term) ||
                ((transportLines.find(t => t.carrierCodigo === a.carrierCodigo))?.TransportLine || '').toLowerCase().includes(term) ||
                ((liberaciones.find(l => l.asignacionCajaId === a.id))?.selloValidado || '').toLowerCase().includes(term) ||
                (a.horaAsignacion || '').toLowerCase().includes(term) ||
                (a.transportLineId || '').toLowerCase().includes(term) ||
                ((a as any).cfmRef || '').toLowerCase().includes(term) ||
                (String((a as any).vehiculos || '')).toLowerCase().includes(term)
            )
        );
    }

    // Massive Query Filter
    if (activeMassQuery && activeMassQuery.length > 0) {
        result = result.filter(c => {
            return activeMassQuery.every(cond => {
                const targetVal = c[cond.column as keyof AsignacionCajaModel];
                return evaluateCondition(targetVal, cond);
            });
        });
    }

    // Compute counts BEFORE cargadoFilter is applied
    // Helper: true si la fila está en algún status de cancelación
    const isCanceledStatus = (dockVal: string) =>
        dockVal === 'RECHAZADO' || dockVal === 'DROP' || dockVal === 'NO SHOW' || dockVal === 'CANCELED';

    let pendientesCount = 0;
    let llegadosCount = 0;
    let cerradoCount = 0;
    let canceladoCount = 0;
    let sinLayoutCount = 0;
    let sinCcpCount = 0;
    let vehiculosPorCerrar = 0;
    let vehiculosCerrado = 0;

    result.forEach(a => {
        const dockVal = String((a as any).dockArribo || '').trim().toUpperCase();
        const v = parseInt((a as any).vehiculos, 10);
        if (isCanceledStatus(dockVal)) {
            canceladoCount++;
        } else if (liberaciones.some(lib => lib.asignacionCajaId === a.id)) {
            cerradoCount++;
            if (!isNaN(v)) vehiculosCerrado += v;
        } else if ((a as any).arribo) {
            llegadosCount++;
            if (!(a as any).layoutUrl) sinLayoutCount++;
            if (!(a as any).ccpUrl)    sinCcpCount++;
            if (!isNaN(v)) vehiculosPorCerrar += v;
        } else {
            pendientesCount++;
            if (!(a as any).layoutUrl) sinLayoutCount++;
            if (!(a as any).ccpUrl)    sinCcpCount++;
            if (!isNaN(v)) vehiculosPorCerrar += v;
        }
    });

    const filterCounts = {
        ALL: result.length - canceladoCount,
        PENDIENTES: pendientesCount,
        LLEGADOS: llegadosCount,
        CERRADO: cerradoCount,
        CANCELADO: canceladoCount,
        SIN_LAYOUT: sinLayoutCount,
        SIN_CCP: sinCcpCount,
        VEHICULOS_POR_CERRAR: vehiculosPorCerrar,
        VEHICULOS_CERRADO: vehiculosCerrado,
    };

    // Cargado Filter
    if (cargadoFilter === 'ALL') {
        result = result.filter(a => {
            const dockVal = String((a as any).dockArribo || '').trim().toUpperCase();
            return !isCanceledStatus(dockVal);
        });
    } else {
        result = result.filter(a => {
            const dockVal = String((a as any).dockArribo || '').trim().toUpperCase();
            if (cargadoFilter === 'CANCELADO') return isCanceledStatus(dockVal);
            if (cargadoFilter === 'CERRADO')   return !isCanceledStatus(dockVal) && liberaciones.some(lib => lib.asignacionCajaId === a.id);
            if (cargadoFilter === 'LLEGADOS')  return !isCanceledStatus(dockVal) && !liberaciones.some(lib => lib.asignacionCajaId === a.id) && (a as any).arribo;
            // PENDIENTES
            return !isCanceledStatus(dockVal) && !liberaciones.some(lib => lib.asignacionCajaId === a.id) && !(a as any).arribo;
        });
    }


    // Apply sorting
    if (sortConfig) {
        result.sort((a, b) => {
            let valA: any = a[sortConfig.key as keyof AsignacionCajaModel];
            let valB: any = b[sortConfig.key as keyof AsignacionCajaModel];

            // Computed / Special columns
            if (sortConfig.key === 'selloLiberacion') {
                const libA = liberaciones.find(l => l.asignacionCajaId === a.id);
                const libB = liberaciones.find(l => l.asignacionCajaId === b.id);
                valA = libA ? libA.selloValidado : '';
                valB = libB ? libB.selloValidado : '';
            } else if (sortConfig.key === 'tipoCaja') {
                const cajaA = cajas.find(c => c.NumeroCaja === a.numeroCaja);
                const cajaB = cajas.find(c => c.NumeroCaja === b.numeroCaja);
                valA = cajaA?.tipo || '';
                valB = cajaB?.tipo || '';
            } else if (sortConfig.key === 'transportLineId') {
                const tlA = transportLines.find(tl => tl.transportLineId === a.transportLineId);
                const tlB = transportLines.find(tl => tl.transportLineId === b.transportLineId);
                valA = tlA?.nombreSubLinea || a.transportLineId || '';
                valB = tlB?.nombreSubLinea || b.transportLineId || '';
            } else if (sortConfig.key === 'carrierCodigo') {
                const tlA = transportLines.find(tl => tl.transportLineId === a.transportLineId);
                const tlB = transportLines.find(tl => tl.transportLineId === b.transportLineId);
                valA = tlA?.TransportLine || a.carrierCodigo || '';
                valB = tlB?.TransportLine || b.carrierCodigo || '';
            } else if (sortConfig.key === 'liberacionDock') {
                const ldA = liberacionesDock.find(ld => ld.asignacionCajaId === a.id);
                const ldB = liberacionesDock.find(ld => ld.asignacionCajaId === b.id);
                valA = ldA ? (ldA.fechaHoraRegistro || ldA.fechaLiberacion || '') : '';
                valB = ldB ? (ldB.fechaHoraRegistro || ldB.fechaLiberacion || '') : '';
            } else if (sortConfig.key === 'layoutStatus') {
                valA = a.layoutUrl ? 1 : 0;
                valB = b.layoutUrl ? 1 : 0;
            } else if (sortConfig.key === 'ccpStatus') {
                valA = a.ccpUrl ? 1 : 0;
                valB = b.ccpUrl ? 1 : 0;
            } else if (sortConfig.key === 'anexo29Status') {
                valA = (a as any).anexo29Url ? 1 : 0;
                valB = (b as any).anexo29Url ? 1 : 0;
            } else if (sortConfig.key === 'isCargado') {
                valA = liberaciones.some(l => l.asignacionCajaId === a.id) ? 1 : 0;
                valB = liberaciones.some(l => l.asignacionCajaId === b.id) ? 1 : 0;
            } else if (sortConfig.key === 'fechaSellado') {
                const libA = liberaciones.find(l => l.asignacionCajaId === a.id);
                const libB = liberaciones.find(l => l.asignacionCajaId === b.id);
                valA = libA ? (libA as any).fecha : '';
                valB = libB ? (libB as any).fecha : '';
            } else if (sortConfig.key === 'cfmRef') {
                const libA = liberaciones.find(l => l.asignacionCajaId === a.id);
                const libB = liberaciones.find(l => l.asignacionCajaId === b.id);
                valA = libA ? (libA as any).cfmRef || '' : '';
                valB = libB ? (libB as any).cfmRef || '' : '';
            } else if (sortConfig.key === 'vehiculosCount') {
                const libA = liberaciones.find(l => l.asignacionCajaId === a.id);
                const libB = liberaciones.find(l => l.asignacionCajaId === b.id);
                valA = libA ? parseInt((libA as any).vehiculosAsociados || '0', 10) : 0;
                valB = libB ? parseInt((libB as any).vehiculosAsociados || '0', 10) : 0;
            } else if (sortConfig.key === 'docId') {
                valA = a.id || '';
                valB = b.id || '';
            }

            if (!valA && valA !== 0) valA = '';
            if (!valB && valB !== 0) valB = '';
            
            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    } else {
        // Default Sort: No. Operacion (asc), then tie-break with createdAt (CSV sequence)
        result.sort((a, b) => {
            const opA = a.numeroOperacion || '';
            const opB = b.numeroOperacion || '';
            
            if (opA < opB) return -1;
            if (opA > opB) return 1;
            
            // Secondary sort by createdAt to preserve CSV insertion order for identical operations
            const crA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const crB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return crA - crB;
        });
    }

    return { filteredData: result, filterCounts };
  }, [asignaciones, searchTerm, cargadoFilter, dateRange, activeMassQuery, sortConfig, liberaciones, liberacionesDock, scacFilter, subLineaFilter, transportLines, user, cajas]);


  const handleApplyMassQuery = () => {
    const valid = queryConditions.filter(c => c.operator === 'empty' || c.operator === 'not_empty' || c.input.trim());
    setActiveMassQuery(valid.length > 0 ? valid : null);
    setIsMassQueryOpen(false);
  };

  const handleClearMassQuery = () => {
    setActiveMassQuery(null);
    setQueryConditions([{ id: Math.random().toString(), column: 'numeroCaja', operator: 'in', type: 'string', input: '' }]);
    setIsMassQueryOpen(false);
  };

  const handleSort = (key: string) => {
      if (sortConfig && sortConfig.key === key) {
          if (sortConfig.direction === 'asc') setSortConfig({ key, direction: 'desc' });
          else setSortConfig(null);
      } else {
          setSortConfig({ key, direction: 'asc' });
      }
  };

  const renderSortIcon = (key: string) => {
      if (sortConfig?.key === key) {
          return sortConfig.direction === 'asc' 
              ? <ChevronUp size={16} className="inline-block ml-1 text-blue-600 font-bold" /> 
              : <ChevronDown size={16} className="inline-block ml-1 text-blue-600 font-bold" />;
      }
      return <ChevronUp size={16} className="inline-block ml-1 text-slate-400 opacity-50 group-hover:opacity-100 transition-opacity" />;
  };

  const renderColumnHeader = (label: React.ReactNode, key: string) => (
    <div 
        onClick={() => handleSort(key)} 
        className={`flex items-center gap-1 cursor-pointer hover:text-blue-600 transition-colors group ${sortConfig?.key === key ? 'text-blue-700 font-bold' : ''}`}
    >
        {label}
        {renderSortIcon(key)}
    </div>
  );

  const handleCajaChange = (numeroCaja: string) => {
      const selected = cajas.find(c => c.NumeroCaja === numeroCaja);
      if (selected) {
          setFormData(prev => ({
              ...prev,
              numeroCaja: selected.NumeroCaja,
              subLinea: selected.nombreSubLinea || '',
              placasCaja: selected.placas || ''
          }));
      }
  };

  const handleDriverChange = (driverId: string) => {
      const selected = drivers.find(d => d.driverId === driverId);
      if (selected) {
          setFormData(prev => ({
              ...prev,
              driverId: selected.driverId,
              nombreDriver: selected.nombre,
              placasTracto: selected.placasTracto || ''
          }));
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
    if (!formData.carrierCodigo || !formData.transportLineId || !formData.numeroCaja || !formData.driverId) {
      alert('Los campos CARRIER PADRE (SCAC), LÍNEA DE TRANSPORTE, EQUIPMENT y TRUCK TRACTOR son obligatorios.');
      return;
    }

    // VALIDACIÓN: horario aprobado — misma lógica que el dropdown
    if ((formData.fecha || '') >= '2026-07-07') {
      const dayConfig = citasConfig[formData.fecha || ''] || {};
      const allSlots = getAllSlotsForDate(formData.fecha || '', dayConfig);
      
      const validSlots = allSlots.filter(s => s !== '11:00' || dayConfig['11:00'] !== undefined);
      
      if (!formData.horaAsignacion || !validSlots.includes(formData.horaAsignacion)) {
        alert(`El horario "${formData.horaAsignacion || 'sin seleccionar'}" no es un slot aprobado. Por favor selecciona un horario de la lista.`);
        return;
      }
      
      // Ventana ya iniciada: solo aplica si la fecha es hoy — excepción manual 18:00 del 14/07/2026 y 17:00 del 15/07/2026
      const isManualOverride18 = (formData.fecha === '2026-07-14' && formData.horaAsignacion === '18:00')
                               || (formData.fecha === '2026-07-15' && formData.horaAsignacion === '17:00')
                               || (formData.fecha === '2026-07-20' && formData.horaAsignacion === '18:00')
                               || (formData.fecha === '2026-07-22' && formData.horaAsignacion === '17:00');
      const isConfigured = dayConfig[formData.horaAsignacion] !== undefined;
      
      if (!isManualOverride18 && !isConfigured && formData.fecha === getMexicoDateString() && formData.horaAsignacion <= getMexicoNow()) {
        alert(`La ventana de las ${formData.horaAsignacion} ya inició. Selecciona el siguiente horario disponible.`);
        return;
      }
    }

    // VALIDACIÓN DE CAPACIDAD: Máximo 6 operaciones por hora (o dinámico)
    if (formData.horaAsignacion) {
      const dayConfig = citasConfig[formData.fecha || ''] || {};
      const maxSlots = dayConfig[formData.horaAsignacion] !== undefined 
        ? dayConfig[formData.horaAsignacion] 
        : ((formData.horaAsignacion === '15:00' && formData.fecha === '2026-07-06') ? 8
           : (formData.fecha === '2026-07-14' && (formData.horaAsignacion === '17:00' || formData.horaAsignacion === '18:00')) ? 1
           : (formData.fecha === '2026-07-15' && formData.horaAsignacion === '17:00') ? 6
           : (formData.fecha === '2026-07-22' && formData.horaAsignacion === '17:00') ? 2
           : 6);
           
      if (maxSlots === 0 || (formData.horaAsignacion === '11:00' && dayConfig['11:00'] === undefined)) {
        alert('Horario no asignado seleccionar otra hora de ventana');
        return;
      }

      const useNewSchedule = (formData.fecha || '') >= '2026-07-07';
      
      const asignacionesDia = asignaciones.filter(a => a.fecha === formData.fecha && (!isEditing || a.id !== formData.id));
      const waterfallOccupancy = calculateWaterfallOccupancy(formData.fecha || '', asignacionesDia, dayConfig, useNewSchedule);
      
      const sameHourCount = waterfallOccupancy[formData.horaAsignacion] || 0;
      
      if (sameHourCount >= maxSlots) {
        alert('Horario no asignado seleccionar otra hora de ventana');
        return;
      }
    }

    // VALIDACIÓN DE DUPLICADOS: No permitir misma caja el mismo día (excepto si está CANCELADA)
    const isDuplicate = asignaciones.some(a => 
      a.fecha === formData.fecha && 
      a.numeroCaja === formData.numeroCaja && 
      (!isEditing || a.id !== formData.id) &&
      a.dockArribo !== 'CANCELED'
    );

    if (isDuplicate) {
      alert(`ERROR: La caja "${formData.numeroCaja}" ya tiene una asignación registrada para el día ${formData.fecha}. No se permiten duplicados en la misma fecha operativa.`);
      return;
    }

    // FAILSAFE: garantizar carrierCodigo antes de guardar
    let finalCarrier = formData.carrierCodigo || '';
    if (!finalCarrier && subLineaFilter) {
      const matchingTL = transportLines.find(
        tl => (tl.TransportLine || '').toLowerCase() === subLineaFilter.toLowerCase()
      );
      finalCarrier = matchingTL?.carrierCodigo || '';
    }
    if (!finalCarrier) {
      const matchCaja = cajas.find(c => c.NumeroCaja === formData.numeroCaja);
      finalCarrier = matchCaja?.carrierCodigo || '';
    }
    const finalFormData = { ...formData, carrierCodigo: finalCarrier };

    // Resolve SCAC: the TransportLine code displayed in the SCAC column
    // Primary: match by transportLineId
    const resolvedTL = transportLines.find(tl => tl.transportLineId === finalFormData.transportLineId);
    // Fallback: match by subLinea name if primary lookup has no TransportLine
    const resolvedTLBySubLinea = !resolvedTL?.TransportLine
      ? transportLines.find(tl => tl.nombreSubLinea && finalFormData.subLinea && tl.nombreSubLinea.trim().toUpperCase() === (finalFormData.subLinea || '').trim().toUpperCase())
      : null;
    const finalScac = resolvedTL?.TransportLine || resolvedTLBySubLinea?.TransportLine || '';
    (finalFormData as any).scac = finalScac;
    (finalFormData as any).citaConfirmadaAt = new Date().toISOString();

    if (isEditing && formData.id) {
      // Recalculate customId so it always reflects the latest op/fecha/carrier/scac
      const datePart = ((finalFormData as any).fecha || '').replace(/-/g, '');
      const recalcId = `${(finalFormData as any).numeroOperacion || ''}${datePart}${(finalFormData as any).carrierCodigo || ''}${finalScac || ''}`;
      if (recalcId) (finalFormData as any).customId = recalcId;
      await asignacionCajaService.updateAsignacion(formData.id, finalFormData);
    } else {
      const newRecord: AsignacionCajaModel = {
        ...(finalFormData as AsignacionCajaModel),
        createdBy: user?.email || 'sistema',
        createdAt: new Date().toISOString()
      };
      await asignacionCajaService.addAsignacion(newRecord);
    }
    setShowModal(false);
    loadData();
  } catch (error: any) {
    if (error?.code === 'DUPLICATE_TL' || error?.message === 'DUPLICATE_TL') {
      setShowModal(false);
      setShowDuplicateTLModal(true);
    } else {
      console.error('Error guardando asignación:', error);
      alert('Error al guardar. Intenta de nuevo.');
    }
  }
  };

  const isAdmin = user?.role === UserRole.ADMIN;

  const handleDelete = async (id: string) => {
    if (!id) return;
    if (pendingDeleteId === id) {
      // Segunda confirmación
      setPendingDeleteId(null);
      if (isAdmin) {
        // Admin: borrado real
        try {
          await asignacionCajaService.deleteAsignacion(id);
          // Desvincular sello
          const sello = await selloService.getSelloByAsignacionCajaId(id);
          if (sello?.id) await selloService.deleteSello(sello.id);
          
          setSelectedIds(prev => { const s = new Set(prev); s.delete(id); return s; });
          loadData();
        } catch (error: any) {
          console.error('Error eliminando asignación:', error);
          alert(`Error al eliminar: ${error?.message || 'Verifica tu conexión e intenta de nuevo.'}`);
          loadData();
        }
      } else {
        // No-Admin: mostrar modal de motivo de cancelación
        setCancelModal({ ids: [id], reason: '' });
      }
    } else {
      // Primera interacción — confirmación inline
      setPendingDeleteId(id);
      setTimeout(() => setPendingDeleteId(prev => prev === id ? null : prev), 3000);
    }
  };

  const handleCancelSubmit = async () => {
    if (!cancelModal) return;
    const reason = cancelModal.reason.trim();
    if (!reason) {
      alert('Por favor escribe el motivo de cancelación antes de continuar.');
      return;
    }
    try {
      for (const id of cancelModal.ids) {
        await asignacionCajaService.updateAsignacion(id, {
          dockArribo: 'CANCELED',
          comentariosArribo: reason,
        });
        // Desvincular sello
        const sello = await selloService.getSelloByAsignacionCajaId(id);
        if (sello?.id) await selloService.deleteSello(sello.id);
      }
      setCancelModal(null);
      setSelectedIds(new Set());
      loadData();
    } catch (error: any) {
      console.error('Error cancelando asignación:', error);
      alert(`Error al cancelar: ${error?.message || 'Verifica tu conexión e intenta de nuevo.'}`);
    }
  };

  const handleMassDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`¿Seguro que deseas eliminar/cancelar las ${selectedIds.size} asignaciones seleccionadas?`)) return;
    if (isAdmin) {
      // Admin: borrado real
      setLoading(true);
      try {
        for (const id of selectedIds) {
          await asignacionCajaService.deleteAsignacion(id);
          // Desvincular sello
          const sello = await selloService.getSelloByAsignacionCajaId(id);
          if (sello?.id) await selloService.deleteSello(sello.id);
        }
        setSelectedIds(new Set());
        loadData();
      } catch (error) {
        console.error('Error deleting items', error);
        alert('Hubo un error borrando algunas asignaciones.');
        loadData();
      }
    } else {
      // No-Admin: modal de motivo de cancelación
      setCancelModal({ ids: [...selectedIds], reason: '' });
    }
  };

  const toggleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(filteredData.map(a => a.id!)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleSelectRow = (id: string) => {
    const newSec = new Set(selectedIds);
    if (newSec.has(id)) newSec.delete(id);
    else newSec.add(id);
    setSelectedIds(newSec);
  };

  const openNew = async () => {
      const today = getMexicoDateString();
      const nextOp = await asignacionCajaService.getNextOperationNumber(today);

      // Auto-detect carrier for TRANSPORTISTA: find parent carrier from their sub-line SCAC
      let autoCarrier = '';
      let autoSubScac = '';
      if (subLineaFilter) {
          const matchingTL = transportLines.find(
              tl => (tl.TransportLine || '').toUpperCase() === subLineaFilter.toUpperCase()
          );
          autoCarrier = matchingTL?.carrierCodigo || '';
          autoSubScac = subLineaFilter; // lock to user's sub-line SCAC
      }

      // For CARRIER role: if they have only one sub-line SCAC, pre-select it
      let autoCarrierSubScac = '';
      if (scacFilter) {
          const carrierLines = transportLines.filter(
              tl => tl.carrierCodigo === scacFilter || tl.TransportLine === scacFilter
          );
          const uniqueSubScacs = [...new Set(carrierLines.map(tl => tl.TransportLine).filter(Boolean))] as string[];
          if (uniqueSubScacs.length === 1) autoCarrierSubScac = uniqueSubScacs[0];
      }

      setFormData({
          fecha: today,
          horaAsignacion: '',
          numeroOperacion: nextOp,
          ...(scacFilter ? { carrierCodigo: scacFilter, ...(autoCarrierSubScac ? { scac: autoCarrierSubScac } : {}) } : {}),
          ...(autoCarrier ? { carrierCodigo: autoCarrier } : {}),
          ...(autoSubScac ? { scac: autoSubScac } : {})
      } as any);
      setIsEditing(false);
      setShowModal(true);
  };

  const openEdit = (record: AsignacionCajaModel) => {
      setFormData({
          ...record,
          horaAsignacion: record.horaAsignacion || ''
      });
      setIsEditing(true);
      setShowModal(true);
  };

  // Descarga via blob — nunca expone la URL del proveedor de almacenamiento
  const downloadFileAsBlob = async (url: string, filename: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (e) {
      console.error('Error al descargar archivo:', e);
    }
  };


  // CIERRE MANUAL BATCH (Admin only) — criterios idénticos al badge Admin del sidebar
  const handleBatchManualClose = async () => {
    const eligible = filteredData.filter(a => {
      const dockVal = String((a as any).dockArribo || '').trim().toUpperCase();
      const isRechazado = dockVal === 'RECHAZADO';
      const isDrop = dockVal === 'DROP';
      const isNoShow = dockVal === 'NO SHOW';
      const hasUSDB1 = String((a as any).observaciones || '').toUpperCase().includes('USDB1');
      if (isRechazado || isDrop || isNoShow || hasUSDB1) return false;
      const hasCCP = !!(a as any).ccpUrl || !!(a as any).ccpUploadedAt;
      const isClosed = liberaciones.some(l => l.asignacionCajaId === a.id && !!l.selloValidado);
      return hasCCP && !isClosed;
    });

    if (eligible.length === 0) {
      alert('No hay operaciones elegibles para cierre manual en el rango actual.');
      return;
    }
    if (!window.confirm(`¿Cerrar manualmente ${eligible.length} operación(es) pendiente(s)?\n\n• Fecha de cierre: hoy\n• Hora: 1 hora después del CCP (o tiempo actual si no hay CCP)\n• Observaciones: "Cierre manual por caída de API"\n\nEsta acción no se puede deshacer.`)) return;

    setIsBatchClosing(true);
    setBatchResult(null);
    const todayDate = getMexicoDateString();
    let ok = 0; let err = 0;

    for (const a of eligible) {
      try {
        const exactSello = sellos.find(s => s.asignacionCajaId === a.id);
        const selloRow = exactSello || sellos.find(s => s.numeroCaja === a.numeroCaja && s.fechaAsignacion === a.fecha);

        let fechaHoraRegistro: string;
        if ((a as any).ccpUploadedAt) {
          const ccpPlus1h = new Date(new Date((a as any).ccpUploadedAt).getTime() + 60 * 60 * 1000);
          fechaHoraRegistro = ccpPlus1h.toLocaleString('es-MX', { timeZone: 'America/Monterrey', hour12: false });
        } else {
          fechaHoraRegistro = new Date().toLocaleString('es-MX', { timeZone: 'America/Monterrey', hour12: false });
        }

        const lib: LiberacionRecord = {
          fechaLiberacion: todayDate,
          asignacionCajaId: a.id!,
          numeroCaja: a.numeroCaja,
          selloValidado: selloRow?.selloAsignado || '',
          coincideConOriginal: true,
          usuario: user?.email || user?.name || 'admin',
          fechaHoraRegistro,
          fotos: { cajaUrl: '', puertasUrl: '', selloUrl: '' },
          createdAt: new Date().toISOString()
        };
        await liberacionService.addLiberacion(lib);

        const currentObs = (a.observaciones || '').trim();
        const newObs = currentObs
          ? `${currentObs} | Cierre manual por caída de API`
          : 'Cierre manual por caída de API';
        await asignacionCajaService.updateAsignacion(a.id!, { observaciones: newObs } as any);
        ok++;
      } catch (e) {
        console.error('Error en cierre manual de', a.numeroCaja, e);
        err++;
      }
    }

    setIsBatchClosing(false);
    setBatchResult({ ok, err });
    await loadData();
    window.dispatchEvent(new Event('reserva:changed'));
  };

  // CSV EXPORT
  const exportCSV = () => {
      const headers = ["FECHA", "HORA", "NO. OPERACIÓN", "NÚMERO CAJA", "CARRIER (SCAC)", "NOMBRE COMERCIAL", "SUB-LÍNEA", "PLACAS CAJA", "DRIVER ID", "NOMBRE DRIVER", "PLACAS TRACTO", "MODELO", "ARRIBO", "DOCK", "COMENTARIOS ARRIBO", "TIPO", "LIBERACION DOCK", "LAYOUT", "CCP", "ANEXO29", "SELLO ASIGNADO", "FECHA SELLADO", "OBSERVACIONES", "CARRIER REF"];
      const rows = filteredData.map(a => {
          const lib = liberaciones.find(l => l.asignacionCajaId === a.id);
          const tl = transportLines.find(t => t.transportLineId === (a as any).transportLineId) 
                  || transportLines.find(t => t.carrierCodigo === a.carrierCodigo);
          return [
              a.fecha,
              a.horaAsignacion || '',
              a.numeroOperacion || '',
              a.numeroCaja,
              (a as any).scac || a.carrierCodigo || '',
              tl?.nombreSubLinea || tl?.TransportLine || a.subLinea || '',
              a.subLinea || '',
              a.placasCaja || '',
              a.driverId,
              a.nombreDriver || '',
              a.placasTracto || '',
              a.modeloAsignado || '',
              (a as any).arribo || '',
              (a as any).dockArribo || '',
              (a as any).comentariosArribo || '',
              cajas.find(c => c.NumeroCaja === a.numeroCaja)?.tipo || '',
              lib?.dockLiberacion || '',
              a.layoutUploadedAt ? new Date(a.layoutUploadedAt).toLocaleString('es-MX', { timeZone: 'America/Monterrey', hour12: false }) : '',
              a.ccpUploadedAt ? new Date(a.ccpUploadedAt).toLocaleString('es-MX', { timeZone: 'America/Monterrey', hour12: false }) : '',
              a.anexo29UploadedAt ? new Date(a.anexo29UploadedAt).toLocaleString('es-MX', { timeZone: 'America/Monterrey', hour12: false }) : '',
              lib ? lib.selloValidado : '',
              lib && lib.fechaHoraRegistro ? lib.fechaHoraRegistro : '',
              a.observaciones || '',
              a.carrierRef || ''
          ];
      });
      const csvContent = [headers, ...rows].map(e => e.map(item => `"${(item || '').replace(/"/g, '""')}"`).join(",")).join("\n");
      const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `asignaciones_diarias_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  // CSV TEMPLATE
  const downloadTemplate = () => {
      const headers = ["FECHA", "HORA", "NO. OPERACIÓN", "NÚMERO CAJA", "DRIVER ID", "MODELO", "OBSERVACIONES", "CARRIER REF"];
      const example = ["2026-03-25", "09:30", "OP-001", "EMCU-123456", "ARC-001", "MODEL A, MODEL B", "Carga prioritaria", "CFM-26CFTTN-001"];
      // Nota: CARRIER (SCAC) y NOMBRE COMERCIAL se derivan automaticamente del NUMERO CAJA al importar
      const note  = ["YYYY-MM-DD (obligatorio)", "HH:MM (opcional)", "Auto si vacío", "⚠ DEBE EXISTIR EN CATÁLOGO EQUIPMENT", "⚠ DEBE EXISTIR EN CATÁLOGO DRIVERS", "Ej: BOLT 6, PRO 6 (opcional)", "Máx 50 caracteres", "Opcional"];
      const csvContent = [headers, note, example].map(e => e.join(",")).join("\n");
      const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", "plantilla_asignacion_cajas.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  // CSV IMPORT
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (e) => {
          const text = e.target?.result as string;
          const rows = parseCSV(text);
          if (rows.length < 2) return alert("El archivo está vacío o no tiene datos válidos.");

          const headers = rows[0].map(h => h.trim().toUpperCase());
          const fIdx  = headers.findIndex(h => h.includes('FECHA'));
          const hIdx  = headers.findIndex(h => h.includes('HORA'));
          const oIdx  = headers.findIndex(h => h.includes('OPERACI'));
          const cIdx  = headers.findIndex(h => h.includes('CAJA'));
          const dIdx  = headers.findIndex(h => h.includes('DRIVER'));
          const mIdx  = headers.findIndex(h => h.includes('MODELO'));
          const obsIdx = headers.findIndex(h => h.includes('OBSERVACIONES'));
          const crIdx  = headers.findIndex(h => h.includes('CARRIER REF'));

          if (fIdx === -1 || cIdx === -1 || dIdx === -1) {
              return alert("Estructura inválida. La cabecera debe contener al menos FECHA, NÚMERO CAJA y DRIVER ID.");
          }

          setLoading(true);
          let imported = 0;
          let errors: string[] = [];
          const seenInBatch = new Set<string>();
          
          const waterfallByDate: Record<string, Record<string, number>> = {};
          
          const getOccupancy = (fecha: string) => {
            if (!waterfallByDate[fecha]) {
               const dayCfg = citasConfig[fecha] || {};
               const useNew = fecha >= '2026-07-07';
               const asigDia = asignaciones.filter(a => a.fecha === fecha);
               waterfallByDate[fecha] = calculateWaterfallOccupancy(fecha, asigDia, dayCfg, useNew);
            }
            return waterfallByDate[fecha];
          };

          for (let i = 1; i < rows.length; i++) {
              const r = rows[i];
              let rawFecha = r[fIdx]?.trim();
              
              // Normalizar fechas tipo DD/MM/YYYY que exporta Excel a YYYY-MM-DD
              if (rawFecha && rawFecha.includes('/')) {
                  const parts = rawFecha.split('/');
                  if (parts.length === 3) {
                      const year = parts[2].length === 4 ? parts[2] : `20${parts[2]}`;
                      const month = parts[1].padStart(2, '0');
                      const day = parts[0].padStart(2, '0');
                      rawFecha = `${year}-${month}-${day}`;
                  }
              }

              const rawHora = hIdx !== -1 ? r[hIdx]?.trim() : '';
              const rawOperacion = oIdx !== -1 ? r[oIdx]?.trim().toUpperCase() : '';
              const rawCaja = r[cIdx]?.trim().toUpperCase();
              const rawDriver = r[dIdx]?.trim().toUpperCase();
              const rawModelo = mIdx !== -1 ? r[mIdx]?.trim().toUpperCase() : '';
              const rawObs = obsIdx !== -1 ? r[obsIdx]?.trim().substring(0, 50) : '';
              const rawCarrierRef = crIdx !== -1 ? r[crIdx]?.trim() : '';

              // Ignorar fila de instrucciones de la plantilla
              if (rawFecha?.startsWith('YYYY') || rawCaja?.startsWith('⚠')) continue;

              if (!rawFecha && !rawCaja && !rawDriver) continue;
              if (!rawFecha || !rawCaja || !rawDriver) {
                  errors.push(`Fila ${i + 1}: Faltan datos (Fecha, Caja o Driver)`);
                  continue;
              }

              // VALIDACIÓN DE DUPLICADOS EN IMPORTACIÓN
              const isDuplicateInDb = asignaciones.some(a => a.fecha === rawFecha && a.numeroCaja === rawCaja);
              const batchKey = `${rawFecha}|${rawCaja}`;
              const isDuplicateInBatch = seenInBatch.has(batchKey);

              if (isDuplicateInDb || isDuplicateInBatch) {
                  errors.push(`Fila ${i + 1}: La caja "${rawCaja}" ya está asignada para el ${rawFecha} (Duplicado omitido)`);
                  continue;
              }
              seenInBatch.add(batchKey);

              const finalHora = rawHora || new Date().toTimeString().substring(0, 5);
              const hrPrefix = finalHora.substring(0, 2);
              const hourKey = `${rawFecha}|${hrPrefix}`;

              if (finalHora === '11:00' || hrPrefix === '11') {
                 errors.push(`Fila ${i + 1}: El horario de las 11:00 está BLOQUEADO — fila omitida.`);
                 continue;
              }

              const dayConfig = citasConfig[rawFecha] || {};
              const hrPrefixExact = hrPrefix + ':00';
              const useNewSchedule = rawFecha >= '2026-07-07';
              const occupancy = getOccupancy(rawFecha);
              
              const slots = getAllSlotsForDate(rawFecha, dayConfig);
              const resolvedSlot = resolveToSlot(finalHora, slots);

              const maxSlots = dayConfig[resolvedSlot] !== undefined 
                ? dayConfig[resolvedSlot]
                : (rawFecha === '2026-07-24' && hrPrefix === '14') ? 7 : 6;
                
              if (maxSlots === 0 || (resolvedSlot === '11:00' && dayConfig['11:00'] === undefined)) {
                  errors.push(`Fila ${i + 1}: El horario ${resolvedSlot} está bloqueado o sin capacidad para la fecha ${rawFecha} — fila omitida.`);
                  continue;
              }
              
              const currentCount = useNewSchedule ? (occupancy[resolvedSlot] || 0) : (occupancy[`${hrPrefix}:00`] || 0);
              
              if (currentCount >= maxSlots) {
                  errors.push(`Fila ${i + 1}: El horario ${resolvedSlot} ya tiene el máximo de ${maxSlots} operaciones para la fecha ${rawFecha} — fila omitida.`);
                  continue;
              }
              
              if (useNewSchedule) {
                 occupancy[resolvedSlot] = currentCount + 1;
              } else {
                 occupancy[`${hrPrefix}:00`] = currentCount + 1;
              }

              const matchCaja = cajas.find(c => c.NumeroCaja.toUpperCase() === rawCaja);
              const matchDriver = drivers.find(d => d.driverId.toUpperCase() === rawDriver);

              const carrierPadre = matchCaja ? matchCaja.carrierCodigo : (matchDriver ? matchDriver.carrierCodigo : '');
              const transportId = matchDriver?.transportLineId || '';

              if (!matchCaja) {
                  errors.push(`Fila ${i + 1}: EQUIPMENT "${rawCaja}" no existe en el catálogo de cajas — fila omitida.`);
                  continue;
              }
              if (!matchDriver) {
                  errors.push(`Fila ${i + 1}: TRUCK TRACTOR "${rawDriver}" no existe en el catálogo de drivers — fila omitida.`);
                  continue;
              }

              const csvScac = transportLines.find(tl => tl.transportLineId === transportId)?.TransportLine || '';
              const asig: AsignacionCajaModel = {
                  fecha: rawFecha,
                  horaAsignacion: finalHora,
                  numeroOperacion: rawOperacion || '',
                  carrierCodigo: carrierPadre,
                  scac: csvScac,
                  transportLineId: transportId,
                  numeroCaja: rawCaja,
                  subLinea: matchCaja ? matchCaja.nombreSubLinea || '' : '',
                  placasCaja: matchCaja ? matchCaja.placas || '' : '',
                  driverId: rawDriver,
                  nombreDriver: matchDriver ? matchDriver.nombre : rawDriver,
                  placasTracto: matchDriver ? matchDriver.placasTracto || '' : '',
                  modeloAsignado: rawModelo || '',
                  observaciones: rawObs || '',
                  ...(rawCarrierRef ? { carrierRef: rawCarrierRef } as any : {}),
                  createdAt: new Date(Date.now() + i).toISOString()
              };

              try {
                  await asignacionCajaService.addAsignacion(asig);
                  imported++;
              } catch(err: any) {
                  errors.push(`Fila ${i + 1}: Error al guardar - ${err.message || 'Desconocido'}`);
              }
          }
          
          if (fileInputRef.current) fileInputRef.current.value = '';
          
          if (errors.length > 0) {
              setImportErrors([`Se importaron ${imported} registros con éxito.`, ...errors]);
          } else {
              alert(`Importación finalizada. ${imported} registros integrados relacionando maestras.`);
          }
          loadData();
      };
      reader.readAsText(file);
  };

  return (
    <div className="flex-1 flex flex-col -mt-8 -mx-8 bg-slate-100 overflow-hidden" style={{ height: 'calc(100vh - 4rem)' }}>

      {/* ── POPUP: Cita duplicada ── */}
      {showDuplicateTLModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">⚠️</span>
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Cita ya no disponible</h2>
            <p className="text-slate-600 mb-6">
              Este número de operación ya fue asignado por otro usuario.<br/>
              <span className="font-semibold text-red-600">Selecciona otro horario.</span>
            </p>
            <button
              onClick={() => { setShowDuplicateTLModal(false); loadData(); }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl transition-colors"
            >
              Aceptar
            </button>
          </div>
        </div>
      )}

      {/* ── Modal: Motivo de Cancelación (roles no-Admin) ── */}
      {cancelModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <span className="text-2xl">🚫</span>
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">Motivo de Cancelación</h2>
                <p className="text-sm text-slate-500">
                  {cancelModal.ids.length === 1
                    ? 'El registro no será eliminado. Se marcará como CANCELED en DOCK.'
                    : `Los ${cancelModal.ids.length} registros se marcarán como CANCELED en DOCK.`}
                </p>
              </div>
            </div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              ¿Por qué se cancela esta cita? <span className="text-red-500">*</span>
            </label>
            <textarea
              autoFocus
              rows={4}
              value={cancelModal.reason}
              onChange={e => setCancelModal(prev => prev ? { ...prev, reason: e.target.value } : prev)}
              placeholder="Escribe el motivo de cancelación..."
              className="w-full border border-slate-300 rounded-xl p-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
            />
            <p className="text-xs text-slate-400 mt-1 mb-5">Este texto aparecerá en la columna <span className="font-semibold">COMENTARIOS ARRIBO</span>.</p>
            <div className="flex gap-3">
              <button
                onClick={handleCancelSubmit}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 px-6 rounded-xl transition-colors"
              >
                Confirmar Cancelación
              </button>
              <button
                onClick={() => setCancelModal(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-6 rounded-xl transition-colors"
              >
                Volver
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-shrink-0 px-14 pt-8 pb-4 z-20 bg-slate-100 border-b border-slate-200 shadow-sm">
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <div>
               <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Navigation className="text-blue-600" />
              {t('asig.title')}
           </h1>
           <p className="text-slate-500 text-sm mt-1">{t('asig.subtitle')}</p>
        </div>
        
        <div className="flex items-center gap-3 flex-wrap">
             {/* ── KPI strip (Selector homologado con handheld, estilo día) ── */}
             <div className="flex gap-1 bg-white p-1 rounded-lg shadow-sm border border-slate-300">
               <button onClick={() => setCargadoFilter('ALL')} className={`rounded-md p-1 min-w-[60px] flex flex-col items-center justify-center transition-all border ${cargadoFilter === 'ALL' ? 'bg-slate-100 border-slate-200 text-slate-800 shadow-sm' : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>
                  <span className="text-sm font-black">{filterCounts.ALL}</span>
                  <span className="text-[8px] font-bold uppercase tracking-wider mt-0.5">{t('filter.todos')}</span>
               </button>
               {[
                 { key: 'PENDIENTES', label: 'Pendientes', val: filterCounts.PENDIENTES, colorSelected: 'text-blue-700', colorUnselected: 'text-blue-600', bg: cargadoFilter === 'PENDIENTES' ? 'bg-blue-50 border-blue-200 shadow-sm' : 'border-transparent hover:bg-slate-50' },
                 { key: 'LLEGADOS',   label: 'En Proceso', val: filterCounts.LLEGADOS,   colorSelected: 'text-amber-700', colorUnselected: 'text-amber-600', bg: cargadoFilter === 'LLEGADOS' ? 'bg-amber-50 border-amber-200 shadow-sm' : 'border-transparent hover:bg-slate-50' },
                 { key: 'CERRADO',    label: 'Cerrado',    val: filterCounts.CERRADO,    colorSelected: 'text-emerald-700', colorUnselected: 'text-emerald-600', bg: cargadoFilter === 'CERRADO' ? 'bg-emerald-50 border-emerald-200 shadow-sm' : 'border-transparent hover:bg-slate-50' },
                 { key: 'CANCELADO',  label: 'Cancelado',  val: filterCounts.CANCELADO,  colorSelected: 'text-red-700', colorUnselected: 'text-red-600', bg: cargadoFilter === 'CANCELADO' ? 'bg-red-50 border-red-200 shadow-sm' : 'border-transparent hover:bg-slate-50' },
               ].map(k => {
                 const isSelected = cargadoFilter === k.key;
                 return (
                   <button key={k.key} onClick={() => setCargadoFilter(k.key as any)} className={`rounded-md border p-1 min-w-[70px] flex flex-col items-center justify-center transition-all ${k.bg} ${isSelected ? k.colorSelected : 'text-slate-500 hover:text-slate-700'}`}>
                     <span className={`text-sm font-black ${isSelected ? k.colorSelected : k.colorUnselected}`}>{k.val}</span>
                     <span className="text-[8px] font-bold uppercase tracking-wider mt-0.5">{k.label}</span>
                   </button>
                 );
               })}
             </div>

             <div className="flex items-center bg-white border border-slate-300 rounded-lg pr-2 overflow-hidden shadow-sm">
                <button 
                  onClick={() => {
                     const today = getMexicoToday();
                    const newRange = { start: today, end: today };
                    setDateRange(newRange);
                    localStorage.setItem('asig_dateRange', JSON.stringify(newRange));
                    window.dispatchEvent(new Event('reserva:changed'));
                  }}
                  className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold px-3 py-2 text-xs border-r border-slate-200 transition-colors h-full"
                  title="Filtrar por Hoy"
                >
                  {t('common.hoy')}
                </button>
                <Calendar size={14} className="text-slate-400 ml-2" />
                <input 
                    type="date"
                    value={dateRange.start}
                    onChange={e => { const v = { ...dateRange, start: e.target.value }; setDateRange(v); localStorage.setItem('asig_dateRange', JSON.stringify(v)); window.dispatchEvent(new Event('reserva:changed')); }}
                    className="py-2 px-2 text-sm outline-none text-slate-600 bg-transparent"
                    title={t('common.fecha_inicial')}
                />
                <span className="text-slate-300">-</span>
                <input 
                    type="date"
                    value={dateRange.end}
                    onChange={e => { const v = { ...dateRange, end: e.target.value }; setDateRange(v); localStorage.setItem('asig_dateRange', JSON.stringify(v)); window.dispatchEvent(new Event('reserva:changed')); }}
                    className="py-2 px-2 text-sm outline-none text-slate-600 bg-transparent"
                    title={t('common.fecha_final')}
                />
             </div>

             {/* ── Discrepancy alert badge ── */}
             {(() => {
               const discCount = filteredData.filter(a =>
                 vigilancias.some(v => v.asignacionCajaId === a.id && v.discrepancia === true)
               ).length;
               return discCount > 0 ? (
                 <div
                   className="flex items-center gap-1.5 bg-red-50 border border-red-300 text-red-700 px-3 py-2 rounded-lg shadow-sm font-bold text-xs animate-pulse"
                   title={`${discCount} discrepancia(s) detectada(s)`}
                 >
                   <AlertTriangle size={14} className="text-red-600" />
                   {discCount} Discrepancia{discCount !== 1 ? 's' : ''}
                 </div>
               ) : null;
             })()}

             {!isEmbarques && selectedIds.size > 0 && (
                 <button onClick={handleMassDelete} className="px-3 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg border border-red-200 transition-colors shadow-sm flex items-center text-sm font-bold animate-fade-in" title="Eliminar Seleccionados">
                    <Trash2 size={16} className="mr-2" /> {t('btn.borrar')} ({selectedIds.size})
                 </button>
             )}

             <button onClick={() => setIsMassQueryOpen(true)} className={`px-4 py-2 flex items-center rounded-lg border text-sm font-medium transition-colors shadow-sm ${activeMassQuery ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                 <Filter size={16} className="mr-2" />
                 {t('btn.mass')}
             </button>

             {!isEmbarques && (
               <>
                 <button onClick={downloadTemplate} className="px-3 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg border border-slate-300 transition-colors shadow-sm flex items-center text-sm font-medium" title="Plantilla CSV">
                    <FileSpreadsheet size={16} className="text-emerald-600" />
                 </button>

                 <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleFileUpload} />
                 <button onClick={() => fileInputRef.current?.click()} className="px-3 py-2 bg-white text-slate-700 hover:bg-slate-50 rounded-lg border border-slate-300 transition-colors shadow-sm flex items-center text-sm font-medium" title="Subir CSV">
                    <UploadCloud size={16} className="text-indigo-600" />
                 </button>
               </>
             )}

             <button onClick={exportCSV} className="px-4 py-2 bg-white text-slate-700 hover:bg-slate-50 rounded-lg border border-slate-300 transition-colors shadow-sm flex items-center text-sm font-medium">
                <Download size={16} className="mr-2 text-slate-500" /> {t('btn.export')}
             </button>

             <button
               onClick={async () => { setIsRefreshing(true); await loadData(); setIsRefreshing(false); }}
               disabled={isRefreshing}
               className="px-3 py-2 bg-white text-slate-700 hover:bg-emerald-50 rounded-lg border border-slate-300 hover:border-emerald-400 transition-colors shadow-sm flex items-center text-sm font-medium disabled:opacity-60"
               title="Actualizar datos sin recargar la página"
             >
               <RefreshCw size={16} className={`mr-1.5 text-emerald-600 ${isRefreshing ? 'animate-spin' : ''}`} />
               {isRefreshing ? t('btn.actualizando') : t('btn.actualizar')}
             </button>

             {!isEmbarques && (
                 <button onClick={openNew} className="bg-blue-600 text-white px-4 py-2 flex items-center rounded-lg hover:bg-blue-700 shadow-md shadow-blue-500/30 transition-all font-medium text-sm">
                    <Plus size={18} className="mr-2" /> {t('btn.new')}
                 </button>
             )}

             {(user?.role === UserRole.ADMIN || user?.role === UserRole.EXPO_COORDINATOR) && (
               <button
                 onClick={() => setShowCitasModal(true)}
                 className="px-4 py-2 bg-slate-800 text-white hover:bg-slate-900 rounded-lg shadow-md transition-all font-medium text-sm flex items-center"
                 title="Configurar capacidad de citas por día/hora"
               >
                 <Clock size={16} className="mr-2" />
                 Citas
               </button>
             )}

             {/* Cierre manual batch — Admin only */}
             {user?.role === UserRole.ADMIN && (
               <button
                 onClick={handleBatchManualClose}
                 disabled={isBatchClosing}
                 className="bg-red-600 text-white px-4 py-2 flex items-center rounded-lg hover:bg-red-700 shadow-md shadow-red-500/30 transition-all font-medium text-sm disabled:opacity-60 disabled:cursor-wait whitespace-nowrap"
                 title={t('btn.cierre_title')}
               >
                 {isBatchClosing
                   ? (<><Loader2 size={18} className="mr-2 animate-spin" />{t('btn.cerrando')}</>)
                   : (<><Shield size={18} className="mr-2" />{t('btn.cierre')}</>)
                 }
               </button>
             )}
             {batchResult && user?.role === UserRole.ADMIN && (
               <span
                 className={`text-xs font-bold px-2 py-1 rounded-full border cursor-pointer ${
                   batchResult.err > 0
                     ? 'bg-amber-50 text-amber-700 border-amber-300'
                     : 'bg-emerald-50 text-emerald-700 border-emerald-300'
                 }`}
                 onClick={() => setBatchResult(null)}
                 title="Clic para cerrar"
               >
                 ✓ {batchResult.ok} cerradas{batchResult.err > 0 ? ` · ${batchResult.err} errores` : ''}
               </span>
             )}
            </div>
          </div>
          
          <div className="relative w-full">
             <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
             <input 
                 type="text" 
                 placeholder={t('asig.buscar')} 
                 value={searchTerm} 
                 onChange={e => setSearchTerm(e.target.value)}
                 className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm transition-shadow"
             />
          </div>
        </div>
      </div>{/* end controls panel */}

      <div className="flex-1 flex flex-col min-h-0 px-14 py-6 relative z-10">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-auto flex-1 relative">
        <table ref={tableRef} className="text-left" style={{ tableLayout: tableFixed ? 'fixed' : 'auto', width: 'max-content', minWidth:'100%' }}>
          {/* resize handle drag logic — event delegation on thead */}
          <thead
            className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase tracking-wider sticky top-0 z-30 shadow-sm"
            onMouseDown={(e) => {
              const handle = (e.target as HTMLElement).closest('[data-resize-handle]');
              if (!handle) return;
              const th = handle.closest('th') as HTMLTableCellElement;
              const col = th?.dataset?.col;
              if (!col) return;
              e.preventDefault();
              // Capture all rendered column widths from DOM on first drag
              const snapshot: Record<string, number> = {};
              tableRef.current?.querySelectorAll('th[data-col]').forEach(el => {
                const c = (el as HTMLElement).dataset.col!;
                snapshot[c] = el.getBoundingClientRect().width;
              });
              setColWidths(snapshot);
              setTableFixed(true);
              const startX = e.clientX;
              const startW = snapshot[col] ?? th.getBoundingClientRect().width;
              document.body.style.cursor = 'col-resize';
              (document.body.style as any).userSelect = 'none';
              const onMove = (ev: MouseEvent) => {
                const newW = Math.max(50, startW + ev.clientX - startX);
                setColWidths(prev => ({ ...prev, [col]: newW }));
              };
              const onUp = () => {
                document.body.style.cursor = '';
                (document.body.style as any).userSelect = '';
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
              };
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }}
          >
            {/* rh = resize handle helper */}
            {(() => {
              const rh = (col: string) => (
                <div
                  data-resize-handle="true"
                  data-col={col}
                  style={{ position:'absolute', right:0, top:0, bottom:0, width:'5px', cursor:'col-resize', zIndex:2 }}
                  className="hover:bg-blue-400/40 transition-colors"
                />
              );
              const cw = (col: string) => colWidths[col] || undefined;
              return (
            <tr>
              {/* Checkbox — fixed sticky */}
              <th className="p-4 w-[50px] min-w-[50px] max-w-[50px] border-r border-slate-200 bg-slate-100 text-center sticky top-0 left-0 z-40">
                  {!isEmbarques && <input type="checkbox" checked={filteredData.length > 0 && selectedIds.size === filteredData.length} onChange={toggleSelectAll} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer" />}
              </th>
              {/* OPERACIÓN — fixed sticky */}
              <th className="p-4 font-medium w-[130px] min-w-[130px] max-w-[130px] bg-slate-50 sticky top-0 left-[50px] z-40 border-r border-slate-200">{renderColumnHeader(t('col.operacion'), 'numeroOperacion')}</th>
              {/* CAJA — fixed sticky */}
              <th className="p-4 font-medium w-[140px] min-w-[140px] max-w-[140px] bg-slate-50 sticky top-0 left-[180px] z-40 border-r border-slate-200">{renderColumnHeader(t('col.caja'), 'numeroCaja')}</th>
              {/* FECHA — fixed sticky */}
              <th className="p-4 font-medium w-[150px] min-w-[150px] max-w-[150px] bg-slate-50 sticky top-0 left-[320px] z-40 shadow-[4px_0_10px_-3px_rgba(0,0,0,0.1)]">{renderColumnHeader(t('col.fecha'), 'fecha')}</th>
              {/* Scrollable resizable columns */}
              <th data-col="arribo" style={{ width: cw('arribo'), minWidth:60, position:'relative' }} className="p-2 font-medium">{renderColumnHeader(t('col.arribo'), 'arribo')}{rh('arribo')}</th>
              <th data-col="dock" style={{ width: cw('dock'), minWidth:50, position:'relative' }} className="p-2 font-medium">{renderColumnHeader(t('col.dock'), 'dockArribo')}{rh('dock')}</th>
              <th data-col="comentariosArribo" style={{ width: cw('comentariosArribo'), minWidth:80, position:'relative' }} className="p-2 font-medium">{renderColumnHeader(t('col.comentariosArribo'), 'comentariosArribo')}{rh('comentariosArribo')}</th>
              <th data-col="tipo" style={{ width: cw('tipo'), minWidth:50, position:'relative' }} className="p-2 font-medium text-violet-700 bg-violet-50/40">{renderColumnHeader(t('col.tipo'), 'tipoCaja')}{rh('tipo')}</th>
              <th data-col="placasCaja" style={{ width: cw('placasCaja'), minWidth:60, position:'relative' }} className="p-2 font-medium">{renderColumnHeader(t('col.placascaja'), 'placasCaja')}{rh('placasCaja')}</th>
              <th data-col="linea" style={{ width: cw('linea'), minWidth:80, position:'relative' }} className="p-2 font-medium text-blue-600 uppercase text-xs">{renderColumnHeader(t('col.lineatransporte'), 'transportLineId')}{rh('linea')}</th>
              <th data-col="scac" style={{ width: cw('scac'), minWidth:60, position:'relative' }} className="p-2 font-medium text-orange-600 uppercase text-xs">{renderColumnHeader('SCAC', 'carrierCodigo')}{rh('scac')}</th>
              <th data-col="driver" style={{ width: cw('driver'), minWidth:70, position:'relative' }} className="p-2 font-medium">{renderColumnHeader(t('col.driver'), 'nombreDriver')}{rh('driver')}</th>
              <th data-col="placasTracto" style={{ width: cw('placasTracto'), minWidth:60, position:'relative' }} className="p-2 font-medium">{renderColumnHeader(t('col.placastracto'), 'placasTracto')}{rh('placasTracto')}</th>
              <th data-col="modelo" style={{ width: cw('modelo'), minWidth:60, position:'relative' }} className="p-2 font-medium">{renderColumnHeader(t('col.modelo'), 'modeloAsignado')}{rh('modelo')}</th>
              <th data-col="creado" style={{ width: cw('creado'), minWidth:80, position:'relative' }} className="p-2 font-medium text-violet-700 bg-violet-50/40">{renderColumnHeader(t('col.creado'), 'createdAt')}{rh('creado')}</th>
              <th data-col="liberacion" style={{ width: cw('liberacion'), minWidth:60, position:'relative' }} className="p-2 font-medium text-sky-700 bg-sky-50/30">{renderColumnHeader(t('col.liberacion'), 'liberacionDock')}{rh('liberacion')}</th>
              <th data-col="layout" style={{ width: cw('layout'), minWidth:60, position:'relative' }} className="p-2 font-medium text-center text-indigo-700 bg-indigo-50/30">{renderColumnHeader(t('col.layout'), 'layoutStatus')}{rh('layout')}</th>
              <th data-col="ccp" style={{ width: cw('ccp'), minWidth:60, position:'relative' }} className="p-2 font-medium text-center text-sky-700 bg-sky-50/30">{renderColumnHeader(t('col.ccp'), 'ccpStatus')}{rh('ccp')}</th>
              <th data-col="anexo29" style={{ width: cw('anexo29'), minWidth:60, position:'relative' }} className="p-2 font-medium text-center text-emerald-700 bg-emerald-50/30">{renderColumnHeader(t('col.anexo29'), 'anexo29Status')}{rh('anexo29')}</th>
              <th data-col="sello" style={{ width: cw('sello'), minWidth:80, position:'relative' }} className="p-2 font-medium text-teal-700 bg-teal-50/30">{renderColumnHeader(t('col.sello_asignado'), 'selloLiberacion')}{rh('sello')}</th>
              <th data-col="cargado" style={{ width: cw('cargado'), minWidth:60, position:'relative' }} className="p-2 font-medium text-red-800 bg-red-50/30 text-center">{renderColumnHeader(t('col.cargado'), 'isCargado')}{rh('cargado')}</th>
              <th data-col="sellado" style={{ width: cw('sellado'), minWidth:70, position:'relative' }} className="p-2 font-medium text-teal-800 bg-teal-50/30">{renderColumnHeader(t('col.sellado_time'), 'fechaSellado')}{rh('sellado')}</th>
              <th data-col="obs" style={{ width: cw('obs'), minWidth:80, position:'relative' }} className="p-2 font-medium text-slate-800 bg-slate-100/50">{renderColumnHeader(t('col.observaciones'), 'observaciones')}{rh('obs')}</th>
              <th data-col="cfmRef" style={{ width: cw('cfmRef'), minWidth:80, position:'relative' }} className="p-2 font-medium text-indigo-800 bg-indigo-50/50 uppercase text-xs">
                {renderColumnHeader(<>CFM REF <span className="ml-1 text-[9px] bg-indigo-100 text-indigo-500 rounded px-1 py-0.5 font-normal normal-case">auto</span></>, 'cfmRef')}{rh('cfmRef')}
              </th>
              <th data-col="docId" style={{ width: cw('docId'), minWidth:70, position:'relative' }} className="p-2 font-medium text-slate-500 bg-slate-50 text-xs">
                {renderColumnHeader(<>ID <span className="ml-1 text-[9px] bg-slate-200 text-slate-400 rounded px-1 py-0.5 font-normal normal-case">auto</span></>, 'docId')}{rh('docId')}
              </th>
              <th data-col="vehiculos" style={{ width: cw('vehiculos'), minWidth:70, position:'relative' }} className="p-2 font-medium text-emerald-800 bg-emerald-50/50 uppercase text-xs">
                {renderColumnHeader(<>{t('col.vehiculos')} <span className="ml-1 text-[9px] bg-emerald-100 text-emerald-500 rounded px-1 py-0.5 font-normal normal-case">auto</span></>, 'vehiculosCount')}{rh('vehiculos')}
              </th>
              <th data-col="carrierRef" style={{ width: cw('carrierRef'), minWidth:70, position:'relative' }} className="p-2 font-medium text-indigo-700 bg-indigo-50/40 uppercase text-xs">
                {renderColumnHeader("Carrier Ref", 'carrierRef')}{rh('carrierRef')}
              </th>
              {!isEmbarques && <th className="p-2 font-medium text-right bg-slate-50">{t('btn.acciones')}</th>}

            </tr>
              );
            })()}
          </thead>

          <tbody className="divide-y divide-slate-100 text-sm">
            {filteredData.map((a, index) => {
              const liberacion = liberaciones.find(lib => lib.asignacionCajaId === a.id);
              const dockValForIcon = String((a as any).dockArribo || '').trim().toUpperCase();
              const isExcludedIcon = dockValForIcon === 'RECHAZADO' || dockValForIcon === 'DROP' || dockValForIcon === 'NO SHOW';
              const hasLiberacion = isExcludedIcon || !!liberacion;
              // Barcode check: sello assigned → barcodes have been generated
              const exactSello = sellos.find(s => s.asignacionCajaId === a.id);
              const selloRow = exactSello || sellos.find(s => s.numeroCaja === a.numeroCaja && s.fechaAsignacion === a.fecha);
              const hasBarcodes = !!(liberacion?.selloValidado || selloRow?.selloAsignado);
              // Muestra badge si: ya fue marcado en Firebase (evidencia permanente)
              // O si AHORA cumple: barcodes + sin arribo + sin dock + >60 min desde la cita
              const hasArribo = !!((a as any).arribo || '').trim();
              const hasDock = !!((a as any).dockArribo || '').trim();
              let minutesPast = 0;
              if (a.fecha && a.horaAsignacion) {
                const appt = new Date(`${a.fecha}T${a.horaAsignacion}:00`);
                minutesPast = (Date.now() - appt.getTime()) / (1000 * 60);
              }
              const showWorkingTag = a.workingWasAvailable ||
                (hasBarcodes && !hasArribo && !hasDock && minutesPast > 60);

              // Base alternating stripe for visual consistency
              const isEven = index % 2 === 0;
              let rowColorClass = isEven ? 'bg-white hover:bg-slate-50' : 'bg-slate-50 hover:bg-slate-100';

              const dockVal = String((a as any).dockArribo || '').trim().toUpperCase();
              const isRechazado = dockVal === 'RECHAZADO';
              const isDrop = dockVal === 'DROP';
              const isNoShow = dockVal === 'NO SHOW';
              const isCanceled = dockVal === 'CANCELED' || dockVal === 'CANCELADO';
              const hasUSDB1 = String((a as any).observaciones || '').toUpperCase().includes('USDB1');
              const hideDocs = isRechazado || isDrop || isNoShow || isCanceled || hasUSDB1;

              if (isCanceled) {
                  rowColorClass = 'bg-red-100 hover:bg-red-200';
              } else if (isRechazado || isDrop) {
                  rowColorClass = 'bg-yellow-100 hover:bg-yellow-200';
              } else if (isNoShow) {
                  rowColorClass = 'bg-orange-100 hover:bg-orange-200';
              } else {
                  // Urgency overlay (no-liberacion + overtime)
                  if (!hasLiberacion && a.fecha && a.horaAsignacion) {
                      let timeStr = (a.horaAsignacion || '').toLowerCase().trim();
                      let isPM = timeStr.includes('pm') || timeStr.includes('p.m.');
                      let isAM = timeStr.includes('am') || timeStr.includes('a.m.');
                      let [hours, minutes] = timeStr.replace(/[a-z\s.]/g, '').split(':');
                      let h = parseInt(hours || '0', 10);
                      if (isPM && h < 12) h += 12;
                      if (isAM && h === 12) h = 0;
                      const asigDate = new Date(`${a.fecha}T${String(h).padStart(2, '0')}:${minutes || '00'}:00`);
                      if (!isNaN(asigDate.getTime())) {
                          const diffHours = (new Date().getTime() - asigDate.getTime()) / (1000 * 60 * 60);
                          if (diffHours > 4)  rowColorClass = 'bg-red-50 hover:bg-red-100 transition-colors';
                          else if (diffHours > 2) rowColorClass = 'bg-amber-50 hover:bg-amber-100 transition-colors';
                      }
                  }
              }

              if (selectedIds.has(a.id!)) rowColorClass = 'bg-blue-50';

              return (
              <tr key={a.id} className={rowColorClass}>
                <td className="p-4 w-[50px] min-w-[50px] max-w-[50px] bg-inherit border-r border-slate-200 text-center sticky left-0 z-20">
                    {!isEmbarques && <input type="checkbox" checked={selectedIds.has(a.id!)} onChange={() => toggleSelectRow(a.id!)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer" />}
                </td>
                <td className="p-4 w-[130px] min-w-[130px] max-w-[130px] bg-inherit border-r border-slate-200 font-mono font-bold tracking-wide whitespace-nowrap sticky left-[50px] z-20">
                  {(() => {
                    // Logic to display barcode link if a stamp exists
                    const exactSello = sellos.find(s => s.asignacionCajaId === a.id);
                    const selloRow = exactSello || sellos.find(s => s.numeroCaja === a.numeroCaja && s.fechaAsignacion === a.fecha);
                    const selloValor = liberacion?.selloValidado || selloRow?.selloAsignado || '';
                    if (selloValor) {
                      return (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setBarcodeTarget({
                              numeroOperacion: a.numeroOperacion || '-',
                              numeroCaja: a.numeroCaja,
                              sello: selloValor,
                            });
                          }}
                          title="Ver códigos de barras"
                          className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 hover:border-blue-400 transition-all group"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500 group-hover:text-blue-700">
                            <path d="M3 5v3M3 16v3M8 5v3M8 16v3M13 5v3M13 16v3M18 5v3M18 16v3M3 8h5M3 19h5M13 8h8M13 19h8"/>
                          </svg>
                          <span className="font-mono font-black text-sm">{a.numeroOperacion || '-'}</span>
                        </button>
                      );
                    }
                    return <span className="text-pink-700">{a.numeroOperacion || '-'}</span>;
                  })()}
                </td>
                <td className="p-4 w-[140px] min-w-[140px] max-w-[140px] bg-inherit font-semibold text-emerald-700 font-mono tracking-wide sticky left-[180px] z-20 border-r border-slate-200">{a.numeroCaja}</td>
                <td className="p-4 w-[150px] min-w-[150px] max-w-[150px] bg-inherit font-medium text-slate-700 whitespace-nowrap sticky left-[320px] z-20 shadow-[4px_0_10px_-3px_rgba(0,0,0,0.05)]">
                    <div className="flex flex-col gap-0.5">
                       <span className="flex items-center gap-1.5"><Calendar size={12} className="text-blue-500" /> {a.fecha}</span>
                       <div className="flex items-center gap-1.5 flex-wrap">
                          {a.horaAsignacion && <span className="text-xs text-slate-400 font-mono pl-0.5">{a.horaAsignacion}</span>}
                          {showWorkingTag && (
                            <span className="text-[9px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200 rounded px-1 py-0.5 leading-tight whitespace-nowrap">
                              Working as available
                            </span>
                          )}
                        </div>
                    </div>
                </td>
                <td className="p-4 font-mono text-amber-600 font-semibold whitespace-nowrap">{(a as any).arribo || '—'}</td>
                <td className="p-4 font-mono text-sky-700 font-semibold whitespace-nowrap text-xs">
                  {(() => {
                    if (isRechazado || isDrop || isNoShow || isCanceled) return (a as any).dockArribo;
                    if (liberacionesDock.some(lib => lib.asignacionCajaId === a.id)) return 'Dock Liberado';
                    return (a as any).dockArribo || '—';
                  })()}
                </td>
                <td className="p-4 text-slate-500 text-xs max-w-[180px] truncate" title={(a as any).comentariosArribo || ''}>{(a as any).comentariosArribo || '—'}</td>
                <td className="p-4 text-violet-700 text-xs font-bold whitespace-nowrap">{cajas.find(c => c.NumeroCaja === a.numeroCaja)?.tipo || '—'}</td>
                <td className="p-4 font-mono text-slate-500 text-xs uppercase font-medium">{a.placasCaja || '-'}</td>
                
                <td className="p-4 text-xs font-bold text-blue-800 whitespace-nowrap">
                    {transportLines.find(tl => tl.transportLineId === a.transportLineId)?.nombreSubLinea || a.transportLineId || '-'}
                </td>

                <td className="p-4 font-mono text-orange-600 font-medium whitespace-nowrap">{transportLines.find(tl => tl.transportLineId === a.transportLineId)?.TransportLine || '-'}</td>
                <td className="p-4 font-medium text-slate-800 whitespace-nowrap">{a.nombreDriver}</td>
                <td className="p-4 font-mono text-slate-500 text-xs uppercase font-medium whitespace-nowrap">{a.placasTracto || '-'}</td>
                <td className="p-4 font-medium text-slate-700 whitespace-nowrap">{a.modeloAsignado || '-'}</td>
                
                 <td className="p-4 bg-violet-50/20 border-l border-violet-100/50 whitespace-nowrap">
                     {(a as any).createdAt ? (
                         <div className="flex flex-col gap-0">
                             <span className="text-xs text-violet-700 font-mono">
                                 {new Date((a as any).createdAt).toLocaleDateString('es-MX', { timeZone: 'America/Monterrey', day: '2-digit', month: '2-digit', year: 'numeric' })}
                             </span>
                             <span className="text-[10px] text-slate-400 font-mono">
                                 {new Date((a as any).createdAt).toLocaleTimeString('es-MX', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                             </span>
                         </div>
                     ) : (
                         <span className="text-xs text-slate-300">—</span>
                     )}
                 </td>

                 {/* ── LIBERACION DOCK ── */}
                 <td className="p-4 text-center bg-sky-50/20 border-l border-sky-100/50 whitespace-nowrap">
                   <span className="font-mono font-bold text-sky-700 text-xs">
                     {(() => {
                        const dockRec = liberacionesDock.find(ld => ld.asignacionCajaId === a.id);
                        if (!dockRec) return '—';
                        return dockRec.fechaHoraRegistro || dockRec.fechaLiberacion || '—';
                     })()}
                   </span>
                 </td>

                 {/* ── LAYOUT Excel ── (descarga forzada) */}
                 <td className="p-4 text-center bg-indigo-50/20 border-l border-indigo-100/50">
                   {hideDocs ? (
                     <span className="text-slate-400 font-bold">—</span>
                   ) : uploadingFor?.id === a.id && uploadingFor.field === 'layoutUrl' ? (
                     <Loader2 size={18} className="animate-spin text-indigo-400 mx-auto" />
                   ) : a.layoutUrl ? (
                     <div className="flex flex-col items-center gap-0.5">
                       <div className="flex items-center justify-center gap-1">
                         <a href={toDriveDownload(a.layoutUrl)}
                            className="inline-flex items-center justify-center p-1.5 rounded-lg text-blue-600 hover:bg-blue-100 transition-colors"
                            title="Descargar LAYOUT" onClick={e => e.stopPropagation()}>
                           <FileText size={18} />
                         </a>
                         <label className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-100 transition-colors cursor-pointer"
                                title="Reemplazar LAYOUT" onClick={e => e.stopPropagation()}>
                           <UploadCloud size={16} />
                           <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
                                  onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadDoc(a.id!, 'layoutUrl', f, a.numeroCaja); e.target.value = ''; }} />
                         </label>
                       </div>
                       {(a as any).layoutUploadedAt && (
                         <span className="text-[10px] text-indigo-400 font-mono whitespace-nowrap">
                           {new Date((a as any).layoutUploadedAt).toLocaleDateString('es-MX', { timeZone: 'America/Monterrey', day: '2-digit', month: '2-digit' })} {new Date((a as any).layoutUploadedAt).toLocaleTimeString('es-MX', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit', hour12: false })}
                         </span>
                       )}
                     </div>
                   ) : (
                     <label className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 transition-colors cursor-pointer"
                            title="Subir LAYOUT (Excel)" onClick={e => e.stopPropagation()}>
                       <FileText size={18} />
                       <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
                              onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadDoc(a.id!, 'layoutUrl', f, a.numeroCaja); e.target.value = ''; }} />
                     </label>
                   )}
                 </td>

                 {/* ── CCP PDF ── */}
                 <td className="p-4 text-center bg-sky-50/20 border-l border-sky-100/50">
                   {hideDocs ? (
                     <span className="text-slate-400 font-bold">—</span>
                   ) : uploadingFor?.id === a.id && uploadingFor.field === 'ccpUrl' ? (
                     <Loader2 size={18} className="animate-spin text-sky-400 mx-auto" />
                   ) : a.ccpUrl ? (
                     <div className="flex flex-col items-center gap-0.5">
                       <div className="flex items-center justify-center gap-1">
                         <a href={toDriveDownload(a.ccpUrl)} target="_blank" rel="noreferrer"
                            className="inline-flex items-center justify-center p-1.5 rounded-lg text-blue-600 hover:bg-blue-100 transition-colors"
                            title="Descargar CCP" onClick={e => e.stopPropagation()}>
                           <FileText size={18} />
                         </a>
                         <label className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-100 transition-colors cursor-pointer"
                                title="Reemplazar CCP" onClick={e => e.stopPropagation()}>
                           <UploadCloud size={16} />
                           <input type="file" accept="application/pdf" className="hidden"
                                  onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadDoc(a.id!, 'ccpUrl', f, a.numeroCaja); e.target.value = ''; }} />
                         </label>
                       </div>
                       {(a as any).ccpUploadedAt && (
                         <span className="text-[10px] text-sky-400 font-mono whitespace-nowrap">
                           {new Date((a as any).ccpUploadedAt).toLocaleDateString('es-MX', { timeZone: 'America/Monterrey', day: '2-digit', month: '2-digit' })} {new Date((a as any).ccpUploadedAt).toLocaleTimeString('es-MX', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit', hour12: false })}
                         </span>
                       )}
                     </div>
                   ) : (
                     <label className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-300 hover:text-sky-500 hover:bg-sky-50 transition-colors cursor-pointer"
                            title="Subir CCP" onClick={e => e.stopPropagation()}>
                       <FileText size={18} />
                       <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden"
                              onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadDoc(a.id!, 'ccpUrl', f, a.numeroCaja); e.target.value = ''; }} />
                     </label>
                   )}
                 </td>

                 {/* ── Anexo29 PDF ── */}
                 <td className="p-4 text-center bg-emerald-50/20 border-l border-emerald-100/50">
                   {uploadingFor?.id === a.id && uploadingFor.field === 'anexo29Url' ? (
                     <Loader2 size={18} className="animate-spin text-emerald-400 mx-auto" />
                   ) : a.anexo29Url ? (
                     <div className="flex flex-col items-center gap-0.5">
                       <div className="flex items-center justify-center gap-1">
                         <a href={toDriveDownload(a.anexo29Url)}
                            className="inline-flex items-center justify-center p-1.5 rounded-lg text-blue-600 hover:bg-blue-100 transition-colors"
                            title="Descargar Anexo29" onClick={e => e.stopPropagation()}>
                           <FileText size={18} />
                         </a>
                         <label className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-100 transition-colors cursor-pointer"
                                title="Reemplazar Anexo29" onClick={e => e.stopPropagation()}>
                           <UploadCloud size={16} />
                           <input type="file" accept="application/pdf" className="hidden"
                                  onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadDoc(a.id!, 'anexo29Url', f, a.numeroCaja); e.target.value = ''; }} />
                         </label>
                       </div>
                       {(a as any).anexo29UploadedAt && (
                         <span className="text-[10px] text-emerald-400 font-mono whitespace-nowrap">
                           {new Date((a as any).anexo29UploadedAt).toLocaleDateString('es-MX', { timeZone: 'America/Monterrey', day: '2-digit', month: '2-digit' })} {new Date((a as any).anexo29UploadedAt).toLocaleTimeString('es-MX', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit', hour12: false })}
                         </span>
                       )}
                     </div>
                   ) : (
                     <label className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 transition-colors cursor-pointer"
                            title="Subir Anexo29 PDF" onClick={e => e.stopPropagation()}>
                       <FileText size={18} />
                       <input type="file" accept="application/pdf" className="hidden"
                              onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadDoc(a.id!, 'anexo29Url', f, a.numeroCaja); e.target.value = ''; }} />
                     </label>
                   )}
                 </td>
                
                <td className="p-4 border-l border-teal-100/50 bg-teal-50/10 whitespace-nowrap">
                     {(() => {
                       const isRechazado = String((a as any).dockArribo || '').trim().toUpperCase() === 'RECHAZADO';
                       const isDrop = String((a as any).dockArribo || '').trim().toUpperCase() === 'DROP';
                       const isNoShow = String((a as any).dockArribo || '').trim().toUpperCase() === 'NO SHOW';
                       const isCanceled = String((a as any).dockArribo || '').trim().toUpperCase() === 'CANCELED' || String((a as any).dockArribo || '').trim().toUpperCase() === 'CANCELADO';
                       const hideSello = isRechazado || isDrop || isNoShow || isCanceled;
                       if (hideSello) return <span className="text-slate-400 font-bold">—</span>;
                       
                       const exactSello = sellos.find(s => s.asignacionCajaId === a.id);
                       const selloRow = exactSello || sellos.find(s => s.numeroCaja === a.numeroCaja && s.fechaAsignacion === a.fecha);
                       const selloFinal = selloRow?.selloAsignado || liberacion?.selloValidado;
                       if (!selloFinal) return <span className="text-slate-300 text-xs">—</span>;
                       return (
                         <div className="flex flex-col gap-0">
                           <span className="font-mono font-bold text-teal-700 text-sm">{selloFinal}</span>
                           <span className="text-[10px] text-slate-400 font-mono">{selloRow?.fechaHoraRegistro || liberacion?.fechaHoraRegistro || '—'}</span>
                         </div>
                       );
                     })()}
                 </td>
                
                <td className="p-4 text-center">
                    {hasLiberacion ? (
                        <div title="Caja Liberada" className="inline-flex items-center justify-center p-1.5 bg-emerald-100 rounded-full shadow-sm border border-emerald-200">
                           <CheckCircle size={18} className="text-emerald-600" />
                        </div>
                    ) : (
                        <div title="Pendiente de Cierre" className="inline-flex items-center justify-center p-1.5 bg-red-50 rounded-full border border-red-100">
                           <XCircle size={18} className="text-red-500" />
                        </div>
                    )}
                </td>
                <td className="p-4 font-mono text-xs text-teal-800 font-medium whitespace-nowrap">
                    {(() => {
                        if (liberacion?.fechaHoraRegistro) return liberacion.fechaHoraRegistro;
                        if (isExcludedIcon && (a as any).updatedAt) {
                            const d = new Date((a as any).updatedAt);
                            if (!isNaN(d.getTime())) {
                                return `${d.toLocaleDateString('es-MX', { timeZone: 'America/Monterrey', day: '2-digit', month: '2-digit', year: 'numeric' })}, ${d.toLocaleTimeString('es-MX', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}`;
                            }
                        }
                        return '-';
                    })()}
                </td>
                
                <td className="p-4 text-xs text-slate-600 truncate max-w-[200px]" title={a.observaciones || ''}>
                    {a.observaciones || '-'}
                </td>
                {/* ── CFM REF (extraído del nombre del archivo layout) ── */}
                <td className="py-1.5 px-3 bg-indigo-50/20 border-l border-indigo-100/50">
                  {(() => {
                    // Primary: cfmRef stored in Firebase
                    // Fallback: derive from layoutFileName at render time
                    const stored = (a as any).cfmRef || '';
                    if (stored) return <span className="text-xs font-mono font-semibold text-indigo-700 whitespace-nowrap">{stored}</span>;
                    const fname = (a as any).layoutFileName || '';
                    if (fname) {
                      const prefix = 'LAY OUT CCP_';
                      const raw = fname.replace(/\.[^/.]+$/, '');
                      const idx = raw.toUpperCase().indexOf(prefix.toUpperCase());
                      const derived = idx !== -1 ? raw.substring(idx + prefix.length).trim() : '';
                      if (derived) return <span className="text-xs font-mono font-semibold text-indigo-600 whitespace-nowrap" title={`Extraído de: ${fname}`}>{derived}</span>;
                    }
                    return <span className="text-slate-300 text-xs">—</span>;
                  })()}
                </td>
                <td className="p-4 font-mono text-[10px] text-slate-400 truncate max-w-[180px]" title={(a as any).customId || a.id || ''}>{(a as any).customId || a.id || '-'}</td>
                {/* ── VEHICULOS ── */}
                <td className="py-1.5 px-3 bg-emerald-50/20 border-l border-emerald-100/50">
                  {(a as any).vehiculos ? (
                    <span className="text-xs text-slate-500 whitespace-nowrap">{(a as any).vehiculos}</span>
                  ) : (
                    <span className="text-slate-300 text-xs">—</span>
                  )}
                </td>
                {/* ── CARRIER REF ── */}
                <td className="py-1.5 px-3 bg-indigo-50/20 border-l border-indigo-100/50">
                  {a.driverId ? (
                    <span className="text-xs text-indigo-700 font-mono whitespace-nowrap">
                      {typeof a.driverId === 'object' ? JSON.stringify(a.driverId) : String(a.driverId)}
                    </span>
                  ) : (
                    <span className="text-slate-300 text-xs">—</span>
                  )}
                </td>

                {!isEmbarques && (
                  <td className="p-4 flex gap-1.5 justify-end items-center min-w-[130px]">
                    {pendingDeleteId === a.id ? (
                      <>
                        <span className="text-xs text-red-600 font-semibold whitespace-nowrap">{isAdmin ? '¿Eliminar?' : '¿Cancelar?'}</span>
                        <button onClick={() => handleDelete(a.id!)} className="px-2 py-0.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 font-medium">Sí</button>
                        <button onClick={() => setPendingDeleteId(null)} className="px-2 py-0.5 text-xs bg-slate-200 text-slate-600 rounded hover:bg-slate-300 font-medium">No</button>
                      </>
                    ) : (
                      <>
                        {!isEmbarques && (
                          <button onClick={() => openEdit(a)} className="p-1.5 text-blue-600 hover:bg-blue-100 rounded transition-colors" title="Editar">
                            <Edit2 size={16} />
                          </button>
                        )}
                        <button onClick={() => handleDelete(a.id!)} className="p-1.5 text-red-600 hover:bg-red-100 rounded transition-colors" title="Eliminar">
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </td>
                )}
              </tr>
              );
            })}
            {filteredData.length === 0 && !loading && (
              <tr><td colSpan={12} className="p-12 text-center text-slate-400">No se encontraron asignaciones diarias en este rango.</td></tr>
            )}
            {loading && <tr><td colSpan={12} className="p-12 text-center text-slate-400">Cargando operación diaria...</td></tr>}
          </tbody>
        </table>
      </div>{/* end table container */}
      </div>{/* end table area */}

{/* Alerta crítica de sello cambiado */}
      <SelloMismatchAlert
        isOpen={!!mismatchAlert}
        numeroCaja={mismatchAlert?.numeroCaja || ''}
        selloOriginal={mismatchAlert?.selloOriginal || ''}
        selloLiberacion={mismatchAlert?.selloLiberacion || ''}
        onClose={() => setMismatchAlert(null)}
      />

      {/* Popup de códigos de barras — se abre al hacer clic en No. Operación con sello */}
      {barcodeTarget && (
        <BarcodePanelModal
          numeroOperacion={barcodeTarget.numeroOperacion}
          numeroCaja={barcodeTarget.numeroCaja}
          sello={barcodeTarget.sello}
          onClose={() => setBarcodeTarget(null)}
        />
      )
      }

      <CatalogQueryBuilder 
          isOpen={isMassQueryOpen}
          onClose={() => setIsMassQueryOpen(false)}
          columns={columns}
          conditions={queryConditions}
          setConditions={setQueryConditions}
          onApply={handleApplyMassQuery}
          onClear={handleClearMassQuery}
      />

      {/* CitasConfigModal */}
      {showCitasModal && (
        <CitasConfigModal 
          onClose={() => setShowCitasModal(false)}
          onSaved={async () => {
            await loadData();
          }}
        />
      )}

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[110] animate-fade-in p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[92vh]">
            
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Navigation className="text-blue-600" size={20} />
                {isEditing ? 'Editar Asignación' : 'Relacionar Caja / Operador'}
              </h2>
              <button type="button" onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
              {(() => {
                const isRestrictedRole = isEditing && (user?.role === UserRole.CARRIER || user?.role === UserRole.TRANSPORTISTA);
                return (
                  <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
                    
                    {/* Row 1: Fecha / Hora / No. Operación */}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Fecha Operativa</label>
                        <input
                          disabled={isRestrictedRole}
                          type="date"
                          required
                          value={formData.fecha || ''}
                          onChange={async (e) => {
                            const newFecha = e.target.value;
                            // Update date immediately, show placeholder while recalculating TL
                            setFormData(prev => ({ ...prev, fecha: newFecha, numeroOperacion: '...' }));
                            if (newFecha && !isEditing) {
                              // Recalculate TL for the ACTUAL appointment date, not today
                              const nextOp = await asignacionCajaService.getNextOperationNumber(newFecha);
                              setFormData(prev => ({ ...prev, fecha: newFecha, numeroOperacion: nextOp }));
                            } else {
                              setFormData(prev => ({ ...prev, fecha: newFecha }));
                            }
                          }}
                          className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Hora (24h)</label>
                        <div lang="en-GB">
                          <select disabled={isRestrictedRole} required value={formData.horaAsignacion || ''} onChange={e => setFormData({...formData, horaAsignacion: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100">
                            <option value="" disabled>Seleccionar Hora</option>
                            {(() => {
                              const useNewSchedule = (formData.fecha || '') >= '2026-07-07';
                              const baseHours = useNewSchedule
                                ? ["07:30","08:00","08:30","09:00","09:30","10:00","10:30","11:00","12:00","13:00","14:00","15:00"]
                                : ["07:00","08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00"];
                              const dayConfig = citasConfig[formData.fecha || ''] || {};
                              
                              const hours = getAllSlotsForDate(formData.fecha || '', dayConfig);
                              // Resuelve un tiempo libre (ej. 16:33) al slot aprobado que le corresponde
                              const resolveToSlot = (time: string, slots: string[]): string => {
                                const sorted = [...slots].sort();
                                let resolved = sorted[0];
                                for (const s of sorted) { if (s <= time) resolved = s; }
                                return resolved;
                              };
                              const isToday = formData.fecha === getMexicoToday();
                              const mexicoNow = getMexicoNow();
                              
                              const asignacionesDia = asignaciones.filter(a => a.fecha === formData.fecha && (!isEditing || a.id !== formData.id));
                              const waterfallOccupancy = calculateWaterfallOccupancy(formData.fecha || '', asignacionesDia, dayConfig, useNewSchedule);
                              
                              return hours.map(hr => {
                                let count = waterfallOccupancy[hr] || 0;
                                
                                const isConfigured = dayConfig[hr] !== undefined;
                                
                                if (hr === "11:00" && !isConfigured) return <option key={hr} value={hr} disabled>{hr} - BLOQUEADO</option>;
                                // Ventana ya iniciada (solo hoy) — excepción: manual overrides o config explícita
                                const isManualOverride = (formData.fecha === '2026-07-14' && hr === '18:00')
                                                      || (formData.fecha === '2026-07-15' && hr === '17:00')
                                                      || (formData.fecha === '2026-07-20' && hr === '18:00')
                                                      || (formData.fecha === '2026-07-22' && hr === '17:00');
                                const isPast = isToday && hr <= mexicoNow && !isManualOverride && !isConfigured;
                                if (isPast) return <option key={hr} value={hr} disabled>{hr} - INICIADO</option>;
                                // Override especial: 15:00 del 06/07/2026 tuvo 8 citas
                                const maxSlots = isConfigured ? dayConfig[hr] 
                                               : (hr === '15:00' && formData.fecha === '2026-07-06') ? 8
                                               : (formData.fecha === '2026-07-14' && (hr === '17:00' || hr === '18:00')) ? 1
                                               : (formData.fecha === '2026-07-15' && hr === '17:00') ? 6
                                               : (formData.fecha === '2026-07-22' && hr === '17:00') ? 2
                                               : (formData.fecha === '2026-07-24' && hr === '14:00') ? 7
                                               : 6;
                                const isFull = count >= maxSlots || maxSlots === 0;
                                return (
                                  <option key={hr} value={hr} disabled={isFull} className={isFull ? 'text-red-500 font-bold' : ''}>
                                    {hr} {isFull ? (maxSlots === 0 ? '(Bloqueado)' : `(Lleno - ${maxSlots}/${maxSlots})`) : `(${count}/${maxSlots} disponibles)`}
                                  </option>
                                );
                              });
                            })()}

                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">No. Operación</label>
                        <input disabled type="text" value={formData.numeroOperacion || ''} placeholder="Auto" className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none font-mono uppercase bg-slate-100 text-slate-500 cursor-not-allowed" />
                      </div>
                    </div>

                    {/* Row 2: Two columns */}
                    <div className="grid grid-cols-2 gap-4">

                      {/* LEFT COLUMN */}
                      <div className="space-y-3">

                        {/* Carrier */}
                        <div className={`p-3 rounded-xl border space-y-2 ${!formData.carrierCodigo ? 'bg-red-50 border-red-300' : 'bg-indigo-50 border-indigo-100'}`}>
                          <h3 className="text-xs font-bold text-indigo-800 uppercase flex items-center gap-1.5">
                            <Navigation size={12}/> Carrier Padre (SCAC) <span className="text-red-500 font-black">*</span>
                          </h3>
                          <SearchableComboBox
                            required
                            value={formData.carrierCodigo || ''}
                            onChange={val => {
                              // Filtrar sub-líneas que pertenecen a este SCAC
                              const matchingLines = transportLines.filter(tl =>
                                tl.TransportLine === val || tl.carrierCodigo === val
                              );
                              // Obtener SCACs únicos de sub-línea
                              const uniqueSubScacs = [...new Set(matchingLines.map(tl => tl.TransportLine).filter(Boolean))];
                              const autoSubScac = uniqueSubScacs.length === 1 ? uniqueSubScacs[0] : '';
                              // Si hay un solo SCAC de sub-línea con un solo carrier → auto-select
                              const linesForSubScac = autoSubScac ? matchingLines.filter(tl => tl.TransportLine === autoSubScac) : [];
                              const autoLineId = linesForSubScac.length === 1 ? linesForSubScac[0].transportLineId : '';
                              setFormData({
                                ...formData,
                                carrierCodigo: val,
                                transportLineId: autoLineId,
                                scac: autoSubScac || '',
                                numeroCaja: '', driverId: '', subLinea: '', placasCaja: '', nombreDriver: '', placasTracto: ''
                              } as any);
                            }}
                            options={carriers.map(c => ({ value: c.codigo, label: c.nombre, sublabel: c.codigo }))}
                            placeholder="Seleccionar Carrier..."
                            disabled={isRestrictedRole || !!scacFilter || !!subLineaFilter}
                          />
                        </div>

                        {/* Sub-Line SCAC — visible solo cuando el carrier tiene múltiples SCACs */}
                        {(() => {
                          const carrierLines = transportLines.filter(tl =>
                            tl.carrierCodigo === formData.carrierCodigo ||
                            tl.TransportLine === formData.carrierCodigo
                          );
                          const uniqueSubScacs = [...new Set(carrierLines.map(tl => tl.TransportLine).filter(Boolean))];
                          if (!formData.carrierCodigo || uniqueSubScacs.length <= 1) return null;
                          const selectedSubScac = (formData as any).scac || '';
                          return (
                            <div className={`p-3 rounded-xl border space-y-2 ${!selectedSubScac ? 'bg-red-50 border-red-300' : 'bg-cyan-50 border-cyan-100'}`}>
                              <h3 className="text-xs font-bold text-cyan-800 uppercase flex items-center gap-1.5">
                                <Truck size={12}/> Sub-Line (SCAC) <span className="text-red-500 font-black">*</span>
                              </h3>
                              <SearchableComboBox
                                value={selectedSubScac}
                                onChange={subScac => {
                                  setFormData({
                                    ...formData,
                                    scac: subScac,
                                    transportLineId: '',
                                    driverId: '', nombreDriver: '', placasTracto: ''
                                  } as any);
                                }}
                                options={uniqueSubScacs.map(s => ({ value: s, label: s }))}
                                placeholder="Seleccionar Sub-Line SCAC..."
                                disabled={isRestrictedRole || !formData.carrierCodigo || !!subLineaFilter}
                              />
                            </div>
                          );
                        })()}

                        {/* Transport Line */}
                        <div className={`p-3 rounded-xl border space-y-2 ${!formData.transportLineId ? 'bg-red-50 border-red-300' : 'bg-violet-50 border-violet-100'}`}>
                          <h3 className="text-xs font-bold text-violet-800 uppercase flex items-center gap-1.5">
                            <Truck size={12}/> Línea de Transporte <span className="text-red-500 font-black">*</span>
                          </h3>
                          <SearchableComboBox
                            value={formData.transportLineId || ''}
                            onChange={val => {
                              const tl = transportLines.find(t => t.transportLineId === val);
                              setFormData({...formData, transportLineId: val, scac: tl?.TransportLine || formData.carrierCodigo || '', driverId: '', nombreDriver: '', placasTracto: ''} as any);
                            }}
                            options={transportLines
                              .filter(tl => {
                                if (!formData.carrierCodigo) return false;
                                const matchesCarrier = tl.TransportLine === formData.carrierCodigo || tl.carrierCodigo === formData.carrierCodigo;
                                if (!matchesCarrier) return false;
                                // Si hay un subLineScac seleccionado, filtrar también por él
                                const selectedSubScac = (formData as any).scac || '';
                                const uniqueSubScacs = [...new Set(
                                  transportLines
                                    .filter(t => t.carrierCodigo === formData.carrierCodigo || t.TransportLine === formData.carrierCodigo)
                                    .map(t => t.TransportLine).filter(Boolean)
                                )];
                                if (uniqueSubScacs.length > 1 && selectedSubScac) {
                                  return tl.TransportLine === selectedSubScac;
                                }
                                return true;
                              })
                              .map(tl => ({ value: tl.transportLineId, label: tl.nombreSubLinea || tl.TransportLine, sublabel: tl.TransportLine }))}
                            placeholder={formData.carrierCodigo ? 'Seleccionar Sub-Línea...' : 'Selecciona un Carrier primero'}
                            disabled={isRestrictedRole || !formData.carrierCodigo}
                          />
                        </div>

                        {/* Observaciones — (NOT disabled for restricted roles) */}
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                          <h3 className="text-xs font-bold text-slate-600 uppercase">{t('asig.obs_label')}</h3>
                          <input
                            type="text"
                            maxLength={50}
                            value={formData.observaciones || ''}
                            onChange={e => setFormData({...formData, observaciones: e.target.value})}
                            placeholder="Opcional... (máx. 50 caracteres)"
                            className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>

                        {/* Carrier Ref — campo manual */}
                        <div className="p-3 bg-indigo-50/40 rounded-xl border border-indigo-100 space-y-2">
                          <h3 className="text-xs font-bold text-indigo-700 uppercase">Carrier Ref</h3>
                          <input
                            type="text"
                            value={formData.carrierRef || ''}
                            onChange={e => setFormData({...formData, ...({ carrierRef: e.target.value } as any)})}
                            placeholder="Ej. CFM-26CFTTN-..."
                            className="w-full border border-indigo-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none font-mono"
                          />
                        </div>

                      </div>

                      {/* RIGHT COLUMN */}
                      <div className="space-y-3">

                        {/* Caja */}
                        <div className={`p-3 rounded-xl border space-y-2 ${!formData.numeroCaja ? 'bg-red-50 border-red-300' : 'bg-emerald-50 border-emerald-100'}`}>
                          <h3 className="text-xs font-bold text-emerald-800 uppercase flex items-center gap-1.5">
                            <Container size={12}/> {t('form.caja_sec')} <span className="text-red-500 font-black">*</span>
                          </h3>
                          <SearchableComboBox
                            required
                            value={formData.numeroCaja || ''}
                            onChange={val => handleCajaChange(val)}
                            options={cajas
                              .filter(c => {
                                if (!formData.carrierCodigo) return false;
                                if (c.carrierCodigo !== formData.carrierCodigo) return false;
                                if (subLineaFilter) {
                                  if ((c.TransportLine || '').toUpperCase() !== subLineaFilter) return false;
                                }
                                if (formData.transportLineId) {
                                  const selectedTL = transportLines.find(tl => tl.transportLineId === formData.transportLineId);
                                  const targetSubLinea = selectedTL?.nombreSubLinea?.trim().toUpperCase();
                                  const cajaSubLinea = (c.nombreSubLinea || '').trim().toUpperCase();
                                  if (targetSubLinea && cajaSubLinea !== targetSubLinea) return false;
                                }
                                return true;
                              })
                              .map(c => ({ value: c.NumeroCaja, label: c.NumeroCaja, sublabel: c.nombreSubLinea || '' }))}
                            placeholder={formData.transportLineId ? 'Seleccionar Caja...' : (formData.carrierCodigo ? 'Selecciona la Línea primero' : 'Selecciona un Carrier primero')}
                            disabled={isRestrictedRole || !formData.carrierCodigo}
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs text-emerald-700 mb-0.5">Sub-Línea</label>
                              <input disabled value={formData.subLinea || ''} className="w-full bg-emerald-100/50 border-transparent rounded p-1.5 text-xs text-emerald-800 font-medium" placeholder="Auto" />
                            </div>
                            <div>
                              <label className="block text-xs text-emerald-700 mb-0.5">Placas Caja</label>
                              <input disabled value={formData.placasCaja || ''} className="w-full bg-emerald-100/50 border-transparent rounded p-1.5 text-xs text-emerald-800 font-mono" placeholder="Auto" />
                            </div>
                          </div>
                        </div>

                        {/* Driver */}
                        <div className={`p-3 rounded-xl border space-y-2 ${!formData.driverId ? 'bg-red-50 border-red-300' : 'bg-orange-50 border-orange-100'}`}>
                          <h3 className="text-xs font-bold text-orange-800 uppercase flex items-center gap-1.5">
                            <Truck size={12}/> {t('form.tracto_sec')} <span className="text-red-500 font-black">*</span>
                          </h3>
                          <SearchableComboBox
                            required
                            value={formData.driverId || ''}
                            onChange={val => handleDriverChange(val)}
                            options={drivers
                              .filter(d => {
                                if (!formData.carrierCodigo) return false;
                                if (formData.transportLineId) return d.transportLineId === formData.transportLineId;
                                if (subLineaFilter) {
                                  const allowedTLIds = new Set(
                                    transportLines
                                      .filter(tl => (tl.TransportLine || '').toUpperCase() === subLineaFilter)
                                      .map(tl => tl.transportLineId)
                                      .filter(Boolean)
                                  );
                                  if (!d.transportLineId || !allowedTLIds.has(d.transportLineId)) return false;
                                }
                                return d.carrierCodigo === formData.carrierCodigo;
                              })
                              .map(d => ({ value: d.driverId, label: d.nombre, sublabel: d.driverId }))}
                            placeholder={formData.transportLineId ? 'Seleccionar Driver...' : (formData.carrierCodigo ? 'Selecciona la Línea primero' : 'Selecciona un Carrier primero')}
                            disabled={isRestrictedRole || !formData.carrierCodigo}
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs text-orange-700 mb-0.5">Nombre</label>
                              <input disabled value={formData.nombreDriver || ''} className="w-full bg-orange-100/50 border-transparent rounded p-1.5 text-xs text-orange-800" placeholder="Auto" />
                            </div>
                            <div>
                              <label className="block text-xs text-orange-700 mb-0.5">Placas Tracto</label>
                              <input
                                disabled={isRestrictedRole}
                                value={formData.placasTracto || ''}
                                onChange={e => setFormData({...formData, placasTracto: e.target.value.toUpperCase()})}
                                className="w-full bg-white border border-orange-200 rounded p-1.5 text-xs text-orange-800 font-mono focus:ring-2 focus:ring-orange-400 outline-none disabled:bg-slate-100"
                                placeholder="Ej. ABC-123"
                              />
                            </div>
                          </div>
                        </div>

                      </div>
                    </div>

                    {/* Row 3: Producto (Modelo) — full width */}
                    <div className="p-3 bg-purple-50 rounded-xl border border-purple-100 space-y-2">
                      <h3 className="text-xs font-bold text-purple-800 uppercase flex items-center gap-1.5"><Box size={12}/> Producto (Modelo)</h3>
                      <MultiSearchableComboBox
                        options={modelosCaja.map((m: string) => ({ value: m, label: m }))}
                        value={formData.modeloAsignado ? formData.modeloAsignado.split(', ') : []}
                        onChange={values => setFormData({...formData, modeloAsignado: values.join(', ')})}
                        placeholder="Seleccionar modelos de producto..."
                        disabled={isRestrictedRole}
                      />
                    </div>

                  </div>
                );
              })()}

              {/* Footer */}
              <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 shrink-0 bg-slate-50 rounded-b-2xl">
                <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-lg transition-colors">Cancelar</button>
                <button
                  type="submit"
                  disabled={!formData.carrierCodigo || !formData.transportLineId || !formData.numeroCaja || !formData.driverId}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 shadow-md shadow-blue-500/30 transition-all font-bold disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none">
                  {isEditing ? 'Guardar Cambios' : 'Vincular Asignación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Import Errors Modal */}
      {importErrors && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh]">
                  <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-red-50 text-red-700">
                      <h2 className="text-lg font-bold flex items-center gap-2">
                          <XCircle size={20} />
                          Reporte de Importación
                      </h2>
                      <button onClick={() => setImportErrors(null)} className="p-1 hover:bg-red-100 rounded text-red-500">
                          <XCircle size={20} />
                      </button>
                  </div>
                  <div className="p-6 overflow-y-auto flex-1 space-y-2 font-mono text-sm leading-relaxed">
                      <div className="text-emerald-600 font-bold mb-4 bg-emerald-50 p-3 rounded border border-emerald-100">{importErrors[0]}</div>
                      {importErrors.slice(1).map((err, i) => (
                          <div key={i} className="text-red-600 bg-red-50/50 p-2 rounded border border-red-50 shadow-sm">{err}</div>
                      ))}
                  </div>
                  <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                      <button onClick={() => setImportErrors(null)} className="px-6 py-2 bg-slate-200 text-slate-700 font-bold rounded-lg hover:bg-slate-300 transition-colors">Cerrar Reporte</button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};
