import React, { useState, useEffect, useMemo, useRef } from 'react';
import { History, Pencil, FileText, UploadCloud, Loader2, Search, Filter, Calendar, Download, RefreshCw, FileSpreadsheet, AlertTriangle, CheckSquare } from 'lucide-react';
import storageService from '../services/storageService.ts';
import { uploadFileToDrive } from '../services/googleDriveService.ts';
import { HistoricoExpoRecord } from '../types.ts';
import { CatalogQueryBuilder, QueryCondition, evaluateCondition } from '../components/CatalogQueryBuilder';
import { parseCSV } from '../utils/csvHelpers';
import { collection, getDocs, getDocsFromCache } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';

const DODA_FOLDER_ID = '14qiNMFvgyUuR4Z-e9beQzNqWw__CyMQZ';
const ENTRY_FOLDER_ID = '1BORtOzX23VOYtHBicGphlOf-CDp993oI';

// Helper: obtiene la fecha de hoy en zona horaria de México (evita brinco de fecha después de 6PM)
const getMexicoToday = () => {
  const now = new Date();
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Monterrey', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
};

const emptyRecord: HistoricoExpoRecord = {
  trailer: '',
  idNumber: '',
  seal: '',
  transportLine: '',
  cfmRef: '',
  scac: '',
  caat: '',
  pickupDayCFM: '',
  dodaUrl: '',
  entryUrl: '',
  dodaApertureDate: '',
  entryApertureDate: '',
  dateRequested: '',
  crossingDate: '',
  dateReceived: '',
  daysToReceive: '',
  expDoda: '',
  comments: '',
  deliveryDate: '',
  scacAndCaat: '',
  ataDestination: ''
};

const formatMexicanDate = (dtStr: string | undefined | null) => {
    if (!dtStr) return '';
    if (dtStr.includes('/')) {
        let datePart = dtStr.split(',')[0].trim();
        datePart = datePart.split(' ')[0].trim();
        const parts = datePart.split('/');
        if (parts.length >= 3) {
            const year = parts[2].substring(0, 4);
            return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${year}`;
        }
        return datePart;
    }
    if (dtStr.match(/^\d{4}-\d{2}-\d{2}/)) {
        const [y, m, d] = dtStr.substring(0, 10).split('-');
        return `${d}/${m}/${y}`;
    }
    return dtStr;
};

export const HistoricoExpo = () => {
  const [records, setRecords] = useState<HistoricoExpoRecord[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<HistoricoExpoRecord>(emptyRecord);
  const [uploadingFor, setUploadingFor] = useState<{ id: string; field: 'dodaUrl' | 'entryUrl' } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredRecords.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRecords.map(r => r.id!).filter(Boolean)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Search & Filters state
  const [cargadoFilter, setCargadoFilter] = useState<'ALL' | 'CERRADO' | 'POR_CERRAR'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const today = getMexicoToday();
  const get90DaysAgo = () => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Monterrey', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  };
  const [dateRange, setDateRange] = useState({ 
    start: get90DaysAgo(), 
    end: today 
  });
  
  const [isMassQueryOpen, setIsMassQueryOpen] = useState(false);
  const [queryConditions, setQueryConditions] = useState<QueryCondition[]>([
      { id: '1', column: 'trailer', operator: 'in', type: 'string', input: '' }
  ]);
  const [activeMassQuery, setActiveMassQuery] = useState<QueryCondition[] | null>(null);
  
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [importErrors, setImportErrors] = useState<string[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Map asignacionCajaId -> selloAsignado (for enriching SEAL column on existing records)
  const [sellosMap, setSellosMap] = useState<Map<string, string>>(new Map());
  // Map asignacionCajaId -> scac (for enriching TEAM column on existing records)
  const [asignacionesScacMap, setAsignacionesScacMap] = useState<Map<string, string>>(new Map());
  // Map asignacionCajaId -> customId (structured ID: {op}{fecha}{carrier}{scac})
  const [customIdMap, setCustomIdMap] = useState<Map<string, string>>(new Map());
  // Map asignacionCajaId -> cfmRef (extracted from layout filename)
  const [cfmRefMap, setCfmRefMap] = useState<Map<string, string>>(new Map());
  // Map asignacionCajaId -> vehiculos (from asignacion_cajas.vehiculos)
  const [vehiculosMap, setVehiculosMap] = useState<Map<string, string>>(new Map());
  // Map asignacionCajaId -> numeroCaja (for enriching TRAILER column)
  const [trailerMap, setTrailerMap] = useState<Map<string, string>>(new Map());
  // Map asignacionCajaId -> subLinea (for enriching LÍNEA TRANSPORTE column)
  const [transportLineMap, setTransportLineMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const load = () => {
      setRecords([...storageService.getHistoricoExpo()]);
    };
    load();
    const unsub = storageService.subscribe(load);
    return () => unsub();
  }, []);

  // Load sellos map: asignacionCajaId -> selloAsignado
  useEffect(() => {
    const loadSellos = async () => {
      try {
        let snap;
        try {
          snap = await getDocsFromCache(collection(db, 'sellos'));
          if (snap.empty) throw new Error('cache miss');
        } catch {
          snap = await getDocs(collection(db, 'sellos'));
        }
        const map = new Map<string, string>();
        snap.forEach(d => {
          const data = d.data();
          if (data.asignacionCajaId && data.selloAsignado) {
            map.set(data.asignacionCajaId, data.selloAsignado);
          }
        });
        setSellosMap(map);
      } catch (e) {
        console.warn('[HistoricoExpo] Error loading sellos:', e);
      }
    };
    loadSellos();
  }, []);

  // Load asignaciones map: asignacionCajaId -> scac and customId
  useEffect(() => {
    const loadAsignaciones = async () => {
      try {
        let snap;
        try {
          snap = await getDocsFromCache(collection(db, 'asignacion_cajas'));
          if (snap.empty) throw new Error('cache miss');
        } catch {
          snap = await getDocs(collection(db, 'asignacion_cajas'));
        }
        const scacMap = new Map<string, string>();
        const cidMap = new Map<string, string>();
        const cfmRefLocal = new Map<string, string>();
        const vehMap = new Map<string, string>();
        const trlMap = new Map<string, string>();
        const tlnMap = new Map<string, string>();
        snap.forEach(d => {
          const data = d.data();
          if (d.id) {
            if (data.scac)       scacMap.set(d.id, data.scac);
            if (data.customId)   cidMap.set(d.id, data.customId);
            if (data.cfmRef)     cfmRefLocal.set(d.id, data.cfmRef);
            if (data.vehiculos)  vehMap.set(d.id, data.vehiculos);
            // Enrich TRAILER and LÍNEA TRANSPORTE from the assignment
            if (data.numeroCaja) trlMap.set(d.id, String(data.numeroCaja));
            const tLine = data.subLinea || data.transportLine || '';
            if (tLine) tlnMap.set(d.id, tLine);
          }
        });
        setAsignacionesScacMap(scacMap);
        setCustomIdMap(cidMap);
        setCfmRefMap(cfmRefLocal);
        setVehiculosMap(vehMap);
        setTrailerMap(trlMap);
        setTransportLineMap(tlnMap);

        // ── Persist cfmRef + vehiculos into historico_expo records ──────────
        // Ensures both fields are backed up in the record itself, not just
        // looked up dynamically (protects against broken asignacionCajaId links)
        const expoRecords = storageService.getHistoricoExpo();
        const toUpdate: any[] = [];
        expoRecords.forEach(r => {
          const asigId = (r as any).idNumber || (r.id?.startsWith('exp_') ? r.id.substring(4) : '');
          if (!asigId) return;
          const updates: any = { ...r };
          let changed = false;
          if (!r.cfmRef && cfmRefLocal.has(asigId)) { updates.cfmRef = cfmRefLocal.get(asigId); changed = true; }
          if (!(r as any).vehiculos && vehMap.has(asigId)) { updates.vehiculos = vehMap.get(asigId); changed = true; }
          if (changed) toUpdate.push(updates);
        });
        if (toUpdate.length > 0) {
          storageService.upsertHistoricoExpos(toUpdate).catch(() => {});
        }
        // ────────────────────────────────────────────────────────────────────
      } catch (e) {
        console.warn('[HistoricoExpo] Error loading asignaciones:', e);
      }
    };
    loadAsignaciones();
  }, []);

  const handleCreate = async () => {
    const newRecord = { ...emptyRecord, createdAt: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }) };
    await storageService.upsertHistoricoExpos([newRecord]);
    setEditingId(newRecord.id || null);
    setEditForm(newRecord);
  };

  const handleSave = async (id: string) => {
    await storageService.upsertHistoricoExpos([{ ...editForm, id }]);
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    if (confirm('¿Eliminar registro?')) {
      await storageService.deleteHistoricoExpos([id]);
    }
  };

  const handleUploadDoc = async (recordId: string, field: 'dodaUrl' | 'entryUrl', file: File, trailer: string) => {
    try {
      setUploadingFor({ id: recordId, field });
      const label = field === 'dodaUrl' ? 'DODA' : 'ENTRY';
      const folderId = field === 'dodaUrl' ? DODA_FOLDER_ID : ENTRY_FOLDER_ID;
      const ext = file.name.split('.').pop() || 'pdf';
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${label}_${trailer || 'DOC'}_${ts}.${ext}`;
      
      const result = await uploadFileToDrive(file, filename, folderId);
      
      const existingRecord = records.find(r => r.id === recordId);
      if (existingRecord) {
        const uploadedAt = new Date().toLocaleString('es-MX', { timeZone: 'America/Monterrey', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
        await storageService.upsertHistoricoExpos([{
          ...existingRecord,
          [field]: result.webViewLink || '',
          [field === 'dodaUrl' ? 'dodaUploadedAt' : 'entryUploadedAt']: uploadedAt
        }]);
      }
    } catch (e) {
      console.error('Error uploading document:', e);
      alert('Error al subir el documento a Drive');
    } finally {
      setUploadingFor(null);
    }
  };

  const toDriveDownload = (url: string) => {
    if (!url) return '#';
    const match = url.match(/\/d\/(.*?)\/view/);
    if (match && match[1]) {
      return `https://drive.google.com/uc?export=download&id=${match[1]}`;
    }
    return url;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, field: keyof HistoricoExpoRecord) => {
    setEditForm({ ...editForm, [field]: e.target.value });
  };

  // --- FILTERING LOGIC ---
  const { filteredRecords, counts } = useMemo(() => {
    // Filter out completely empty "phantom" records, enrich idNumber, seal and team
    let baseResult = records.filter(r => r.trailer?.trim() || r.cfmRef?.trim()).map(r => {
      const asigId = r.idNumber || (r.id?.startsWith('exp_') ? r.id.substring(4) : '');
      const enriched: any = { ...r };
      // IDNUMBER: always use customId from asignacion_cajas (structured ID)
      if (asigId && customIdMap.has(asigId)) enriched.idNumber = customIdMap.get(asigId);
      else if (!enriched.idNumber && asigId) enriched.idNumber = asigId;
      if (!enriched.seal && asigId && sellosMap.has(asigId)) enriched.seal = sellosMap.get(asigId);
      // TEAM always comes from asignacion_cajas.scac (overrides any stale value in historico_expo)
      if (asigId && asignacionesScacMap.has(asigId)) enriched.team = asignacionesScacMap.get(asigId);
      // CFM REF from asignacion_cajas.cfmRef (extracted from layout filename)
      if (!enriched.cfmRef && asigId && cfmRefMap.has(asigId)) enriched.cfmRef = cfmRefMap.get(asigId);
      // VEHICULOS from asignacion_cajas.vehiculos
      if (asigId && vehiculosMap.has(asigId)) enriched.vehiculos = vehiculosMap.get(asigId);
      // TRAILER from asignacion_cajas.numeroCaja (fills in records created before liberacion)
      if (!enriched.trailer && asigId && trailerMap.has(asigId)) enriched.trailer = trailerMap.get(asigId);
      // LÍNEA TRANSPORTE from asignacion_cajas.subLinea
      if (!enriched.transportLine && asigId && transportLineMap.has(asigId)) enriched.transportLine = transportLineMap.get(asigId);
      return enriched;
    });

    // 1. Date Range Filter
    if (dateRange.start && dateRange.end) {
      baseResult = baseResult.filter(r => {
        const dtStr = r.pickupDayCFM || 
          new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
        let parsedDate = '';
        
        if (dtStr.match(/^\d{4}-\d{2}-\d{2}/)) {
            // Formato ISO YYYY-MM-DD — el más confiable, usar directamente
            parsedDate = dtStr.substring(0, 10);
        } else if (dtStr.includes('/')) {
            // Formato DD/M/YYYY o DD/MM/YYYY (es-MX locale)
            let datePart = dtStr.split(',')[0].trim();
            datePart = datePart.split(' ')[0].trim();
            const parts = datePart.split('/');
            if(parts.length >= 3) {
                const year = parts[2].substring(0, 4);
                parsedDate = `${year}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
            }
        } else {
            parsedDate = new Date(r.createdAt || Date.now()).toISOString().split('T')[0];
        }
        
        return parsedDate >= dateRange.start && parsedDate <= dateRange.end;
      });
    }

    // 2. Search Term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      baseResult = baseResult.filter(r => 
        (r.trailer || '').toLowerCase().includes(term) ||
        (r.cfmRef || '').toLowerCase().includes(term) ||
        (r.expDoda || '').toLowerCase().includes(term) ||
        (r.scacAndCaat || '').toLowerCase().includes(term)
      );
    }

    // 3. Mass Query
    if (activeMassQuery && activeMassQuery.length > 0) {
      baseResult = baseResult.filter(r => {
        return activeMassQuery.every(cond => {
          const rawVal = r[cond.column as keyof HistoricoExpoRecord];
          const valStr = rawVal ? String(rawVal) : '';
          return evaluateCondition(valStr, cond);
        });
      });
    }

    // Compute counts BEFORE cargadoFilter is applied
    const newCounts = {
      ALL: baseResult.length,
      CERRADO: 0,
      POR_CERRAR: 0
    };

    baseResult.forEach(r => {
      const isCerrado = !!(r.dodaUrl && r.entryUrl);
      if (isCerrado) newCounts.CERRADO++;
      else newCounts.POR_CERRAR++;
    });

    // 4. Cargado Filter
    let finalResult = baseResult;
    if (cargadoFilter !== 'ALL') {
      finalResult = baseResult.filter(r => {
        const isCerrado = !!(r.dodaUrl && r.entryUrl);
        return cargadoFilter === 'CERRADO' ? isCerrado : !isCerrado;
      });
    }

    return { filteredRecords: finalResult, counts: newCounts };
  }, [records, dateRange, searchTerm, activeMassQuery, cargadoFilter, sellosMap, asignacionesScacMap, customIdMap, cfmRefMap, vehiculosMap, trailerMap, transportLineMap]);


  // --- CSV LOGIC ---
  const exportCSV = () => {
    if (filteredRecords.length === 0) return alert('No hay registros para exportar');
    const headers = [
      'TRAILER', 'IDNUMBER', 'SEAL', 'TEAM', 'LÍNEA TRANSPORTE', 'CFM REF', 'PICKUP DAY CFM', 'SCAC', 'CAAT',
      'DODA URL', 'ENTRY URL', 'DODA APERTURE DATE', 'ENTRY APERTURE DATE',
      'DATE REQUESTED', 'CROSSING DATE', 'Date Received', 'Days to Receive',
      'EXP DODA', 'COMMENTS', 'DELIVERY DATE', 'ATA DESTINATION'
    ];
    const rows = filteredRecords.map(r => [
      r.trailer, r.idNumber, r.seal, r.team, r.transportLine, r.cfmRef, r.pickupDayCFM, r.scac, r.caat,
      r.dodaUrl, r.entryUrl, r.dodaApertureDate, r.entryApertureDate,
      r.dateRequested, r.crossingDate, r.dateReceived, r.daysToReceive,
      r.expDoda, r.comments, r.deliveryDate || r.scacAndCaat, r.ataDestination
    ]);

    const csvContent = [headers, ...rows].map(e => e.map(item => `"${(item || '').replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `historico_expo_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length < 2) throw new Error("El archivo CSV está vacío o no tiene encabezados.");

      const errors: string[] = [];
      const newRecords: HistoricoExpoRecord[] = [];
      
      const headers = rows[0].map(h => h.trim().toUpperCase());
      
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length < 2) continue;

        const getCol = (name: string) => {
          const idx = headers.findIndex(h => h === name.toUpperCase());
          return idx !== -1 ? row[idx] : '';
        };

        const trailer = getCol('TRAILER');
        if (!trailer) {
          errors.push(`Fila ${i + 1}: TRAILER es obligatorio.`);
          continue;
        }

        // Permitir múltiples nombres para la columna de Línea de Transporte
        let tLine = getCol('LÍNEA TRANSPORTE');
        if (!tLine) tLine = getCol('LINEA TRANSPORTE');
        if (!tLine) tLine = getCol('TRANSPORT LINE');

        newRecords.push({
          trailer,
          idNumber: getCol('IDNUMBER'),
          seal: getCol('SEAL'),
          transportLine: tLine,
          cfmRef: getCol('CFM REF'),
          scac: getCol('SCAC'),
          caat: getCol('CAAT'),
          pickupDayCFM: getCol('PICKUP DAY CFM'),
          dodaUrl: getCol('DODA URL'),
          entryUrl: getCol('ENTRY URL'),
          dodaApertureDate: getCol('DODA APERTURE DATE'),
          entryApertureDate: getCol('ENTRY APERTURE DATE'),
          dateRequested: getCol('DATE REQUESTED'),
          crossingDate: getCol('CROSSING DATE'),
          dateReceived: getCol('Date Received'),
          daysToReceive: getCol('Days to Receive'),
          expDoda: getCol('EXP DODA'),
          comments: getCol('COMMENTS'),
          deliveryDate: getCol('DELIVERY DATE') || getCol('SCAC AND CAAT'),
          scacAndCaat: getCol('SCAC AND CAAT'),
          ataDestination: getCol('ATA DESTINATION'),
          createdAt: Date.now()
        });
      }

      if (newRecords.length > 0) {
        await storageService.upsertHistoricoExpos(newRecords);
        alert(`Se importaron ${newRecords.length} registros exitosamente.`);
      }
      
      if (errors.length > 0) setImportErrors(errors);

    } catch (error: any) {
      alert(`Error al procesar el archivo: ${error.message}`);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };


  return (
    <div className="flex-1 overflow-auto bg-slate-50 relative flex flex-col h-screen">
      <div className="sticky top-0 z-40 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <History className="text-indigo-600" />
            Histórico Expo
          </h1>
          <p className="text-slate-500 text-sm">Registro de Control de Operaciones</p>
        </div>
        <div className="flex items-center gap-2">
          {editingId ? (
            // Editing mode: show Save + Cancel
            <>
              <button
                onClick={() => {
                  const rec = filteredRecords.find(r => r.id === editingId);
                  if (rec) handleSave(editingId);
                }}
                className="bg-emerald-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm hover:bg-emerald-700 transition-colors font-medium"
              >
                Guardar cambios
              </button>
              <button
                onClick={() => { setEditingId(null); setSelectedIds(new Set()); }}
                className="bg-white text-slate-600 px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm border border-slate-300 hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
            </>
          ) : selectedIds.size === 1 ? (
            // Exactly 1 selected: show Editar button
            <button
              onClick={() => {
                const id = [...selectedIds][0];
                const rec = filteredRecords.find(r => r.id === id);
                if (rec) { setEditingId(id); setEditForm(rec); }
              }}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm hover:bg-indigo-700 transition-colors"
            >
              <Pencil size={16} /> Editar registro
            </button>
          ) : (
            // Default: disabled hint
            <button
              disabled
              className="bg-slate-100 text-slate-400 px-4 py-2 rounded-lg flex items-center gap-2 cursor-not-allowed border border-slate-200"
              title="Selecciona un registro para editar"
            >
              <Pencil size={16} /> Editar registro
            </button>
          )}
        </div>
      </div>

      {/* --- AVANCED TOOLBAR --- */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-sm z-30 relative">
        <div className="flex items-center gap-3 overflow-x-auto w-full">
          
          <div className="relative shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Buscar caja, CFM Ref..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm w-64 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 shrink-0 shadow-sm">
            <button
              onClick={() => setCargadoFilter('ALL')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${cargadoFilter === 'ALL' ? 'bg-teal-600 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              Todos ({counts.ALL})
            </button>
            <button
              onClick={() => setCargadoFilter('POR_CERRAR')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${cargadoFilter === 'POR_CERRAR' ? 'bg-teal-600 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              POR CERRAR ({counts.POR_CERRAR})
            </button>
            <button
              onClick={() => setCargadoFilter('CERRADO')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${cargadoFilter === 'CERRADO' ? 'bg-teal-600 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              CERRADO ({counts.CERRADO})
            </button>
          </div>

          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-1 shrink-0">
            <button 
              onClick={() => setDateRange({start: today, end: today})}
              className={`px-3 py-1 text-sm font-medium rounded ${dateRange.start === today && dateRange.end === today ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-200'}`}
            >HOY</button>
            <div className="flex items-center px-2 border-l border-slate-200">
              <Calendar size={16} className="text-slate-400 mr-2" />
              <input type="date" value={dateRange.start} onChange={e => {
                const newRange = {...dateRange, start: e.target.value};
                setDateRange(newRange);
                localStorage.setItem('expo_dateRange', JSON.stringify(newRange));
              }} className="bg-transparent text-sm outline-none text-slate-700 w-[115px] cursor-pointer" />
              <span className="text-slate-300 mx-1">-</span>
              <input type="date" value={dateRange.end} onChange={e => {
                const newRange = {...dateRange, end: e.target.value};
                setDateRange(newRange);
                localStorage.setItem('expo_dateRange', JSON.stringify(newRange));
              }} className="bg-transparent text-sm outline-none text-slate-700 w-[115px] cursor-pointer" />
            </div>
          </div>

          <button
            onClick={() => setIsMassQueryOpen(true)}
            className={`px-4 py-2 rounded-lg border transition-colors shadow-sm flex items-center gap-2 text-sm font-medium whitespace-nowrap shrink-0
              ${activeMassQuery?.length ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}
          >
            <Filter size={16} className={activeMassQuery?.length ? "text-indigo-500" : "text-slate-400"} />
            Filtros Masivos
            {activeMassQuery?.length ? <span className="bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">{activeMassQuery.length}</span> : null}
          </button>

          <div className="flex-1"></div>

          <div className="flex items-center gap-2 shrink-0">
            <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleFileUpload} />
            <button onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }} className="px-3 py-2 bg-slate-50 text-emerald-600 hover:bg-emerald-50 rounded-lg border border-slate-200 transition-colors shadow-sm flex items-center" title="Importar CSV">
              <FileSpreadsheet size={18} />
            </button>
            <button className="px-3 py-2 bg-slate-50 text-indigo-600 hover:bg-indigo-50 rounded-lg border border-slate-200 transition-colors shadow-sm flex items-center" title="Subir Documentos">
              <UploadCloud size={18} />
            </button>
            <button onClick={exportCSV} className="px-4 py-2 bg-white text-slate-700 hover:bg-slate-50 rounded-lg border border-slate-300 transition-colors shadow-sm flex items-center text-sm font-medium gap-2">
              <Download size={16} /> Exportar
            </button>
            <button 
              onClick={() => { setIsRefreshing(true); setTimeout(() => setIsRefreshing(false), 800); }} 
              className="px-4 py-2 bg-white text-slate-700 hover:bg-slate-50 rounded-lg border border-slate-300 transition-colors shadow-sm flex items-center text-sm font-medium gap-2"
            >
              <RefreshCw size={16} className={`text-emerald-600 ${isRefreshing ? 'animate-spin' : ''}`} /> Actualizar
            </button>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-max text-left border-collapse text-sm whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                <tr>
                  <th className="px-3 py-2 whitespace-nowrap text-center">
                    <input type="checkbox" checked={filteredRecords.length > 0 && selectedIds.size === filteredRecords.length} onChange={toggleSelectAll} className="w-4 h-4 accent-indigo-600 cursor-pointer" />
                  </th>
                  <th className="px-3 py-2 whitespace-nowrap">TRAILER</th>
                  <th className="px-3 py-2 whitespace-nowrap">IDNUMBER</th>
                  <th className="px-3 py-2 whitespace-nowrap">SEAL</th>
                  <th className="px-3 py-2 whitespace-nowrap text-slate-500 whitespace-nowrap">VEHICULOS</th>
                  <th className="px-3 py-2 whitespace-nowrap">TEAM</th>
                  <th className="px-3 py-2 whitespace-nowrap">LÍNEA TRANSPORTE</th>
                  <th className="px-3 py-2 whitespace-nowrap">CFM REF</th>
                  <th className="px-3 py-2 whitespace-nowrap">PICKUP DAY CFM</th>
                  <th className="px-3 py-2 whitespace-nowrap">SCAC</th>
                  <th className="px-3 py-2 whitespace-nowrap">CAAT</th>
                  <th className="px-3 py-2 whitespace-nowrap text-center">DODA</th>
                  <th className="px-3 py-2 whitespace-nowrap text-center">ENTRY</th>
                  <th className="px-3 py-2 whitespace-nowrap">DODA APERTURE DATE</th>
                  <th className="px-3 py-2 whitespace-nowrap">ENTRY APERTURE DATE</th>
                  <th className="px-3 py-2 whitespace-nowrap">DATE REQUESTED</th>
                  <th className="px-3 py-2 whitespace-nowrap">CROSSING DATE</th>
                  <th className="px-3 py-2 whitespace-nowrap">Date Received</th>
                  <th className="px-3 py-2 whitespace-nowrap">Days to Receive</th>
                  <th className="px-3 py-2 whitespace-nowrap">EXP DODA</th>
                  <th className="px-3 py-2 whitespace-nowrap">COMMENTS</th>
                  <th className="px-3 py-2 whitespace-nowrap">DELIVERY DATE</th>
                  <th className="px-3 py-2 whitespace-nowrap">ATA DESTINATION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.map(record => {
                  const isEditing = editingId === record.id;
                  
                  return (
                    <tr 
                      key={record.id} 
                      onClick={() => {
                        setEditingId(record.id!);
                        setEditForm(record);
                        // Optional: also select it visually
                        setSelectedIds(new Set([record.id!]));
                      }}
                      className={`hover:bg-slate-50/50 transition-colors cursor-pointer ${selectedIds.has(record.id!) ? 'bg-indigo-50/40 ring-1 ring-inset ring-indigo-200' : ''}`}
                    >
                      <td className="px-3 py-2 whitespace-nowrap text-center" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedIds.has(record.id!)} onChange={() => toggleSelect(record.id!)} className="w-4 h-4 accent-indigo-600 cursor-pointer" />
                      </td>

                      {/* ── READ-ONLY: sourced from Asignación Diaria ── */}
                      <td className="px-3 py-2 whitespace-nowrap text-slate-700 font-medium">{record.trailer}</td>
                      <td className="px-3 py-2 whitespace-nowrap font-mono text-xs text-slate-500">{record.idNumber}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-700">{record.seal}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-500 whitespace-nowrap">{(record as any).vehiculos || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap font-mono text-xs font-semibold text-orange-600">{record.team}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-700">{record.transportLine}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-700">{record.cfmRef}</td>
                      <td className="px-3 py-2 whitespace-nowrap"><span className={record.pickupDayCFM ? 'text-slate-700' : 'text-slate-300'}>{formatMexicanDate(record.pickupDayCFM) || '—'}</span></td>
                      <td className="px-3 py-2 whitespace-nowrap font-mono text-xs text-slate-600">{record.scac}</td>

                      {/* ── EDITABLE (shown read-only in table, editable in modal) ── */}
                      <td className="px-3 py-2 whitespace-nowrap"><span className={record.caat ? 'text-slate-700' : 'text-slate-300'}>{record.caat || '—'}</span></td>


                      {/* DODA */}
                      <td className="px-3 py-2 whitespace-nowrap text-center bg-indigo-50/20 border-l border-indigo-100/50">
                        {uploadingFor?.id === record.id && uploadingFor.field === 'dodaUrl' ? (
                          <Loader2 size={18} className="animate-spin text-indigo-400 mx-auto" />
                        ) : record.dodaUrl ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <div className="flex items-center justify-center gap-1">
                              <a href={toDriveDownload(record.dodaUrl)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center p-1.5 rounded-lg text-blue-600 hover:bg-blue-100 transition-colors" title="Descargar DODA" onClick={e => e.stopPropagation()}>
                                <FileText size={18} />
                              </a>
                              <label className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-100 transition-colors cursor-pointer" title="Reemplazar DODA" onClick={e => e.stopPropagation()}>
                                <UploadCloud size={16} />
                                <input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadDoc(record.id!, 'dodaUrl', f, record.trailer); e.target.value = ''; }} />
                              </label>
                            </div>
                            {record.dodaUploadedAt && (
                              <span className="text-[10px] text-indigo-400 font-mono whitespace-nowrap">{record.dodaUploadedAt}</span>
                            )}
                          </div>
                        ) : (
                          <label className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 transition-colors cursor-pointer" title="Subir DODA" onClick={e => e.stopPropagation()}>
                            <UploadCloud size={18} />
                            <input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadDoc(record.id!, 'dodaUrl', f, record.trailer); e.target.value = ''; }} />
                          </label>
                        )}
                      </td>

                      {/* ENTRY */}
                      <td className="px-3 py-2 whitespace-nowrap text-center bg-emerald-50/20 border-l border-emerald-100/50 border-r">
                        {uploadingFor?.id === record.id && uploadingFor.field === 'entryUrl' ? (
                          <Loader2 size={18} className="animate-spin text-emerald-400 mx-auto" />
                        ) : record.entryUrl ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <div className="flex items-center justify-center gap-1">
                              <a href={toDriveDownload(record.entryUrl)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-100 transition-colors" title="Descargar ENTRY" onClick={e => e.stopPropagation()}>
                                <FileText size={18} />
                              </a>
                              <label className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-100 transition-colors cursor-pointer" title="Reemplazar ENTRY" onClick={e => e.stopPropagation()}>
                                <UploadCloud size={16} />
                                <input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadDoc(record.id!, 'entryUrl', f, record.trailer); e.target.value = ''; }} />
                              </label>
                            </div>
                            {record.entryUploadedAt && (
                              <span className="text-[10px] text-emerald-400 font-mono whitespace-nowrap">{record.entryUploadedAt}</span>
                            )}
                          </div>
                        ) : (
                          <label className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 transition-colors cursor-pointer" title="Subir ENTRY" onClick={e => e.stopPropagation()}>
                            <UploadCloud size={18} />
                            <input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadDoc(record.id!, 'entryUrl', f, record.trailer); e.target.value = ''; }} />
                          </label>
                        )}
                      </td>

                      <td className="px-3 py-2 whitespace-nowrap"><span className={record.dodaApertureDate ? 'text-slate-700' : 'text-slate-300'}>{record.dodaApertureDate || '—'}</span></td>
                      <td className="px-3 py-2 whitespace-nowrap"><span className={record.entryApertureDate ? 'text-slate-700' : 'text-slate-300'}>{record.entryApertureDate || '—'}</span></td>
                      <td className="px-3 py-2 whitespace-nowrap"><span className={record.dateRequested ? 'text-slate-700' : 'text-slate-300'}>{record.dateRequested || '—'}</span></td>
                      <td className="px-3 py-2 whitespace-nowrap"><span className={record.crossingDate ? 'text-slate-700' : 'text-slate-300'}>{record.crossingDate || '—'}</span></td>
                      <td className="px-3 py-2 whitespace-nowrap"><span className={record.dateReceived ? 'text-slate-700' : 'text-slate-300'}>{record.dateReceived || '—'}</span></td>
                      <td className="px-3 py-2 whitespace-nowrap"><span className={record.daysToReceive ? 'text-slate-700' : 'text-slate-300'}>{record.daysToReceive || '—'}</span></td>
                      <td className="px-3 py-2 whitespace-nowrap"><span className={record.expDoda ? 'text-slate-700' : 'text-slate-300'}>{record.expDoda || '—'}</span></td>
                      <td className="px-3 py-2 whitespace-nowrap"><span className={record.comments ? 'text-slate-700' : 'text-slate-300'}>{record.comments || '—'}</span></td>
                      <td className="px-3 py-2 whitespace-nowrap"><span className={(record.deliveryDate || record.scacAndCaat) ? 'text-slate-700' : 'text-slate-300'}>{record.deliveryDate || record.scacAndCaat || '—'}</span></td>
                      <td className="px-3 py-2 whitespace-nowrap"><span className={record.ataDestination ? 'text-slate-700' : 'text-slate-300'}>{record.ataDestination || '—'}</span></td>
                    </tr>
                  );
                })}
                {filteredRecords.length === 0 && (
                  <tr>
                    <td colSpan={23} className="p-8 text-center text-slate-500">
                      No hay registros que coincidan con los filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ═══ EDIT MODAL ════════════════════════════════════════════════════ */}
      {editingId && (() => {
        const rec = filteredRecords.find(r => r.id === editingId);
        if (!rec) return null;
        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden" style={{maxHeight:'90vh'}}>

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Pencil size={18} className="text-indigo-600" />
                  Editar Registro
                </h2>
                <button onClick={() => { setEditingId(null); setSelectedIds(new Set()); }} className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors">
                  ✕
                </button>
              </div>

              <div className="overflow-y-auto flex-1 p-6 space-y-5">

                {/* READ-ONLY info block */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">Información de Asignación Diaria (solo lectura)</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    <div><span className="text-slate-400 text-xs">TRAILER</span><p className="font-semibold text-slate-800">{rec.trailer || '—'}</p></div>
                    <div><span className="text-slate-400 text-xs">IDNUMBER</span><p className="font-mono text-xs text-slate-600">{rec.idNumber || '—'}</p></div>
                    <div><span className="text-slate-400 text-xs">SEAL</span><p className="text-slate-700">{rec.seal || '—'}</p></div>
                    <div><span className="text-slate-400 text-xs">VEHICULOS</span><p className="text-slate-700">{(rec as any).vehiculos || '—'}</p></div>
                    <div><span className="text-slate-400 text-xs">TEAM</span><p className="font-mono font-bold text-orange-600">{rec.team || '—'}</p></div>
                    <div><span className="text-slate-400 text-xs">LÍNEA TRANSPORTE</span><p className="text-slate-700">{rec.transportLine || '—'}</p></div>
                    <div><span className="text-slate-400 text-xs">CFM REF</span><p className="text-slate-700">{rec.cfmRef || '—'}</p></div>
                    <div><span className="text-slate-400 text-xs">PICKUP DAY CFM</span><p className="text-slate-700">{rec.pickupDayCFM ? formatMexicanDate(rec.pickupDayCFM) : '—'}</p></div>
                  </div>
                </div>

                <div className="flex flex-col gap-5">
                  {/* CARRIER Section */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">CARRIER</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">SCAC</label>
                        <input className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none font-mono uppercase bg-white" value={(editForm as any).scac || ''} onChange={e => setEditForm({...editForm, scac: e.target.value} as any)} placeholder="Ej. TQLA" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">CAAT</label>
                        <input className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none bg-white" value={editForm.caat || ''} onChange={e => setEditForm({...editForm, caat: e.target.value} as any)} placeholder="Número CAAT" />
                      </div>
                    </div>
                  </div>

                  {/* BROKER Section */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">BROKER</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">DODA APERTURE DATE</label>
                        <input type="date" className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none bg-white" value={(editForm as any).dodaApertureDate || ''} onChange={e => setEditForm({...editForm, dodaApertureDate: e.target.value} as any)} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">CROSSING DATE</label>
                        <input type="date" className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none bg-white" value={editForm.crossingDate || ''} onChange={e => setEditForm({...editForm, crossingDate: e.target.value})} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">EXP DODA</label>
                        <input type="date" className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none bg-white" value={editForm.expDoda || ''} onChange={e => setEditForm({...editForm, expDoda: e.target.value})} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">ENTRY APERTURE DATE</label>
                        <input type="date" className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none bg-white" value={(editForm as any).entryApertureDate || ''} onChange={e => setEditForm({...editForm, entryApertureDate: e.target.value} as any)} />
                      </div>
                    </div>
                  </div>

                  {/* DESTINATION Section */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">DESTINATION</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">DELIVERY DATE</label>
                        <input type="date" className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none bg-white" value={(editForm as any).deliveryDate || ''} onChange={e => setEditForm({...editForm, deliveryDate: e.target.value} as any)} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">ATA DESTINATION</label>
                        <input type="date" className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none bg-white" value={(editForm as any).ataDestination || ''} onChange={e => setEditForm({...editForm, ataDestination: e.target.value} as any)} />
                      </div>
                    </div>
                  </div>

                  {/* OTROS DATOS Section */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">OTROS DATOS</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">DATE REQUESTED</label>
                        <input type="date" className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none bg-white" value={editForm.dateRequested || ''} onChange={e => setEditForm({...editForm, dateRequested: e.target.value})} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">DATE RECEIVED</label>
                        <input type="date" className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none bg-white" value={editForm.dateReceived || ''} onChange={e => setEditForm({...editForm, dateReceived: e.target.value})} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">DAYS TO RECEIVE</label>
                        <input className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none bg-white" value={editForm.daysToReceive || ''} onChange={e => setEditForm({...editForm, daysToReceive: e.target.value})} placeholder="0" />
                      </div>
                      <div className="flex flex-col gap-1 col-span-2">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">COMMENTS</label>
                        <textarea className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none resize-none bg-white" rows={2} value={editForm.comments || ''} onChange={e => setEditForm({...editForm, comments: e.target.value})} placeholder="Observaciones..." />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
                <button
                  onClick={() => { setEditingId(null); setSelectedIds(new Set()); }}
                  className="px-5 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleSave(editingId)}
                  className="px-6 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors font-semibold shadow-sm"
                >
                  Guardar cambios
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      {isMassQueryOpen && (
        <CatalogQueryBuilder
          isOpen={isMassQueryOpen}
          onClose={() => setIsMassQueryOpen(false)}
          conditions={queryConditions}
          setConditions={setQueryConditions}
          onApply={() => {
            setActiveMassQuery(queryConditions);
            setIsMassQueryOpen(false);
          }}
          onClear={() => {
            setQueryConditions([{ id: '1', column: 'trailer', operator: 'in', type: 'string', input: '' }]);
            setActiveMassQuery(null);
          }}
          columns={[
            'trailer', 'idNumber', 'seal', 'transportLine', 'cfmRef',
            'scac', 'caat', 'pickupDayCFM', 'dodaApertureDate',
            'entryApertureDate', 'dateRequested', 'crossingDate',
            'expDoda', 'deliveryDate', 'ataDestination'
          ]}
        />
      )}

      {/* CSV Import Errors Modal */}
      {importErrors && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-red-50">
              <h3 className="font-bold text-red-800 flex items-center gap-2">
                <AlertTriangle size={18} /> Errores de Importación CSV
              </h3>
            </div>
            <div className="p-4 max-h-96 overflow-y-auto">
              <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600">
                {importErrors.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button onClick={() => setImportErrors(null)} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 font-medium">Cerrar</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
