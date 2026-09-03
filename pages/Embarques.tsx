import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Package, Search, Download, RefreshCw, Loader2, Calendar, Trash2 , ChevronUp, ChevronDown, UserCheck, FileText, UploadCloud, MessageCircle, Database } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { contratoService } from '../services/contratoService.ts';
import { asignacionCajaService } from '../services/asignacionCajaService.ts';
import { checkInService } from '../services/checkInService';
import { selloService } from '../services/selloService';
import { ContratoRecord } from '../types/contrato';
import { UserRole, Dealer } from '../types.ts';
import { CheckInModel } from '../types/checkIn';
import { storageService } from '../services/storageService';
import { vinReportService } from '../services/vinReportService';
import { uploadFileToDrive } from '../services/googleDriveService.ts';
import { xmlciService } from '../services/xmlciService.ts';
import * as XLSX from 'xlsx';
import { useLanguage } from '../context/LanguageContext';
import { VinReportRecord } from '../types';
import { CatalogQueryBuilder } from '../components/CatalogQueryBuilder';

import { nowMX, todayMX, toMXDate } from '../utils/mexTime';

type FilterType = 'ALL' | 'CON_LAYOUT' | 'CON_CCP' | 'SIN_CIERREEMB';
type CheckInFilterType = 'ALL' | 'CON_CITA' | 'SIN_CITA' | 'CON_ERRORES' | 'HOY' | 'ESTA_SEMANA';
type CheckInStatusType = 'TODOS' | 'PENDIENTES' | 'ARRIBADOS';
type ActiveTab = 'CON_LAYOUT' | 'CON_CCP' | 'SIN_CIERREEMB' | 'TODOS' | 'CHECK_IN' | 'REPORTEO_VINS';

export const Embarques: React.FC = () => {
  const [data, setData] = useState<ContratoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // VIN Reports States
  const [vinReports, setVinReports] = useState<VinReportRecord[]>([]);
  const [isSyncingVins, setIsSyncingVins] = useState(false);
  const [queryBuilderOpen, setQueryBuilderOpen] = useState(false);
  const [queryConditions, setQueryConditions] = useState<{id:string, column:string, operator:string, type:string, input:any}[]>([]);
  
  const [startDate, setStartDate] = useState(todayMX());
  const [endDate, setEndDate] = useState(todayMX());

  const { user } = useAuth();
  const { t } = useLanguage();
  const isCarrier = user?.role === UserRole.CARRIER;

  const [activeTab, setActiveTab] = useState<ActiveTab>(isCarrier ? 'CHECK_IN' : 'TODOS');
  const dealersCache = useRef<Dealer[]>([]);
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [dealerFilter, setDealerFilter] = useState<string>('ALL');
  const [checkInsData, setCheckInsData] = useState<CheckInModel[]>([]);
  const [checkInFilter, setCheckInFilter] = useState<'ALL' | 'CON_CITA' | 'SIN_CITA' | 'CON_ERRORES'>('ALL');
  const [docks, setDocks] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [reassignConflicts, setReassignConflicts] = useState<{ id: string; numeroCaja: string; asignadoA: string }[]>([]);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [pendingForceIds, setPendingForceIds] = useState<string[]>([]);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  const EMBARQUES_FOLDER_ID = '1ETyhI2Zddsw_btLBMIQGcYfhkrsmIEQj'; // mismo folder que Asignaciones

  const toDriveDownload = (viewUrl: string) => {
    const match = viewUrl.match(/\/d\/([^/]+)\//);  
    return match ? `https://drive.google.com/uc?export=download&id=${match[1]}` : viewUrl;
  };

  const handleUploadXML = async (recordId: string, factura: string, file: File) => {
    try {
      setUploadingFor(recordId);
      const text = await file.text();
      const parser = new DOMParser();
      
      let cfdiDoc = parser.parseFromString(text, 'text/xml');
      const rootTag = cfdiDoc.documentElement?.tagName;
      if (rootTag === 'w:wordDocument' || rootTag === 'pkg:package') {
        const isInsideDel = (node: Element): boolean => {
            let parent = node.parentElement;
            while (parent) {
                if (parent.tagName === 'w:del') return true;
                parent = parent.parentElement;
            }
            return false;
        };
        const embedded = Array.from(cfdiDoc.getElementsByTagName('w:t'))
            .filter((n: Element) => !isInsideDel(n))
            .map((n: Element) => n.textContent || '').join('');
        if (!embedded.includes('cfdi:Comprobante')) {
            throw new Error('El documento WordML no contiene un CFDI.');
        }
        const cfdiStart = embedded.indexOf('<cfdi:Comprobante');
        const cfdiEnd = embedded.lastIndexOf('</cfdi:Comprobante>');
        if (cfdiStart === -1 || cfdiEnd === -1) {
             throw new Error('No se pudo aislar el bloque CFDI del WordML.');
        }
        const cfdiXml = embedded.substring(cfdiStart, cfdiEnd + '</cfdi:Comprobante>'.length);
        cfdiDoc = parser.parseFromString(cfdiXml, 'text/xml');
      }

      const comp = cfdiDoc.getElementsByTagName('cfdi:Comprobante')[0] || cfdiDoc.getElementsByTagName('Comprobante')[0];
      const emis = cfdiDoc.getElementsByTagName('cfdi:Emisor')[0] || cfdiDoc.getElementsByTagName('Emisor')[0];
      const concs = cfdiDoc.getElementsByTagName('cfdi:Concepto');
      
      if (!comp || !emis || concs.length === 0) {
        throw new Error('El archivo no parece ser un CFDI válido o no tiene conceptos.');
      }
      
      const serie = comp.getAttribute('Serie') || '';
      const folio = comp.getAttribute('Folio') || '';
      const invoiceNo = (serie + folio).trim() || factura || 'S/F';
      const dateRaw = comp.getAttribute('Fecha') || new Date().toISOString();
      const date = dateRaw.split('T')[0];
      const currency = comp.getAttribute('Moneda') || 'USD';
      
      const timbre = cfdiDoc.getElementsByTagName('tfd:TimbreFiscalDigital')[0] || cfdiDoc.getElementsByTagName('TimbreFiscalDigital')[0];
      const uuid = timbre?.getAttribute('UUID') || '';
      
      if (!uuid) {
        throw new Error('El CFDI no contiene un UUID fiscal (TimbreFiscalDigital).');
      }

      const existingUUIDs = await storageService.checkCFDIExistsByUUID([uuid]);
      if (existingUUIDs.has(uuid)) {
         console.warn('UUID ya existe en la base de datos, solo se vinculará al contrato.');
      } else {
         const fileItems: any[] = [];
         for (let i = 0; i < concs.length; i++) {
            const c = concs[i];
            const partNoRaw = c.getAttribute('NoIdentificacion') || `ITEM-${i + 1}`;
            const descripcion = c.getAttribute('Descripcion') || 'Sin descripción';
            const qty = parseFloat(c.getAttribute('Cantidad') || '1');
            const unitPrice = parseFloat(c.getAttribute('ValorUnitario') || '0');
            const totalAmount = qty * unitPrice;

            const vinMatch = descripcion.match(/VIN\s+([A-Z0-9]+)/i);
            const engineMatch = descripcion.match(/ENGINE\s+([^/]+?)(?:\s*\/|\s*\)|\s*$)/i);
            const modelMatch = descripcion.match(/MODELO\s+(.+?)(?:,|\s*$)/i);
            const netWeightMatch = descripcion.match(/PESO NETO\s+([^/)]+)/i);
            const grossWeightMatch = descripcion.match(/PESO BRUTO\s+([^/)]+)/i);
            const addedValueMatch = descripcion.match(/Val\.\s*Agregado\s+(.+)/i);

            const unidad = c.getAttribute('Unidad') || '';
            const cleanDescription = descripcion.split(/[(]|VIN|MODELO|Val\./i)[0].trim();

            fileItems.push({
                id: (vinMatch ? vinMatch[1].trim() : '') || `${uuid}-${i}` || `${invoiceNo}-${partNoRaw}-${i}`,
                invoiceNo, date, item: String(i + 1),
                model: modelMatch ? modelMatch[1].trim() : 'N/A',
                partNo: partNoRaw,
                spanishDescription: cleanDescription,
                englishDescription: 'N/A',
                qty,
                unit: unidad,
                unitPrice,
                totalAmount,
                currency,
                netWeight: netWeightMatch ? parseFloat(netWeightMatch[1]) : 0,
                grossWeight: grossWeightMatch ? parseFloat(grossWeightMatch[1]) : 0,
                addedValue: addedValueMatch ? parseFloat(addedValueMatch[1]) : 0,
                hsCode: '',
                chineseName: 'N/A',
                vin: vinMatch ? vinMatch[1].trim() : '',
                engine: engineMatch ? engineMatch[1].trim() : '',
                rawDescripcion: descripcion,
                uuid: uuid,
                archivo: factura || file.name,
                tipoCambioInfo: null,
                mxnValues: null,
                originalValues: null
            });
         }
         
         const record = xmlciService.extractRecord(cfdiDoc, invoiceNo, date, currency, uuid, factura || file.name);
         if (record) {
             await storageService.addXMLCIRecords([record]);
         }
         await storageService.addCFDIInvoices(fileItems);
      }

      const uploadedBy = user?.email || 'sistema';
      const uploadedAt = nowMX();

      await contratoService.updateContrato(recordId, {
        xmlUrl: 'EXTRACTED', 
        xmlUUID: uuid,
        xmlUploadedBy: uploadedBy,
        xmlUploadedAt: uploadedAt,
        xmlFileName: file.name
      });
      
      setData(prev => prev.map(d => d.id === recordId ? { ...d, xmlUrl: 'EXTRACTED', xmlUUID: uuid, xmlUploadedBy: uploadedBy, xmlUploadedAt: uploadedAt, xmlFileName: file.name } : d));
      
      alert(`XML de Factura ${factura} procesado correctamente. UUID: ${uuid}`);
    } catch (e: any) {
      alert(`Error subiendo XML: ${e.message}`);
    } finally {
      setUploadingFor(null);
    }
  };

  const handleUploadLayout = async (recordId: string, numeroCaja: string, file: File) => {
    try {
      setUploadingFor(recordId);
      const ext = file.name.split('.').pop() || 'file';
      const ts = nowMX().replace(/[:.-]/g, '');
      const filename = `LAYOUT_${numeroCaja}_${ts}.${ext}`;
      const result = await uploadFileToDrive(file, filename, EMBARQUES_FOLDER_ID);
      const url = result?.webViewLink || '';
      const uploadedBy = user?.email || 'sistema';
      const uploadedAt = nowMX();
      
      const extractId = (u: string) => {
        if (!u) return '';
        const parts = u.split('/d/');
        if (parts.length > 1) return parts[1].split(/[/?#]/)[0];
        const m = u.match(/[?&]id=([\w-]+)/);
        return m ? m[1] : '';
      };
      const driveFileId = result?.id || (result as any)?.fileId || extractId(url);

      let cfmRef = '';
      let vehiculos = '';

      if (file.name) {
        const rawName = file.name.replace(/\.[^/.]+$/, '');
        const pi = rawName.toUpperCase().indexOf('LAY OUT CCP_');
        if (pi !== -1) cfmRef = rawName.substring(pi + 12).trim();
      }

      try {
        const { read } = await import('xlsx');
        const buffer = await file.arrayBuffer();
        const wb = read(buffer, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        if (sheet && sheet['D27']?.v !== undefined) vehiculos = String(sheet['D27'].v).trim();
      } catch (err) {
        console.warn('[Layout Embarques] Local parse error:', err);
      }

      // Construir la cadena de sincronización con Asignación — dual-key fallback para mayor robustez
      const record = data.find(d => d.id === recordId);
      const asigChain: Promise<any> = (record?.numeroOperacion || record?.numeroCaja)
        ? (async () => {
            // Intento 1: buscar por numeroOperacion (más específico)
            let asigDoc = record?.numeroOperacion
              ? await asignacionCajaService.getAsignacionByNumeroOperacion(record.numeroOperacion)
              : null;

            // Intento 2: fallback por numeroCaja si el primer intento no encontró nada
            if (!asigDoc && record?.numeroCaja) {
              asigDoc = await asignacionCajaService.getAsignacionByNumeroCaja(record.numeroCaja);
            }

            if (asigDoc && asigDoc.id) {
              const asigUpdates: any = {
                layoutUrl: url,
                layoutUploadedBy: uploadedBy,
                layoutUploadedAt: uploadedAt,
                layoutFileName: file.name,
                layoutFileId: driveFileId,
                ...(cfmRef ? { cfmRef } : {}),
                ...(vehiculos ? { vehiculos } : {}),
              };
              await asignacionCajaService.updateAsignacion(asigDoc.id, asigUpdates);
              if (cfmRef) {
                const { storageService } = await import('../services/storageService');
                await storageService.upsertHistoricoExpos([{ id: `exp_${asigDoc.id}`, cfmRef } as any]);
              }
            } else {
              console.warn('[Layout Embarques] No se encontró asignación para sincronizar. numeroOperacion:', record?.numeroOperacion, '| numeroCaja:', record?.numeroCaja);
            }
          })()
        : Promise.resolve();

      // Correr en paralelo: update del contrato + toda la cadena de asignación
      await Promise.all([
        contratoService.updateContrato(recordId, {
          layoutUrl: url,
          layoutUploadedBy: uploadedBy,
          layoutUploadedAt: uploadedAt,
          layoutFileName: file.name,
        }),
        asigChain
      ]);

      setData(prev => prev.map(d => d.id === recordId ? { ...d, layoutUrl: url, layoutUploadedBy: uploadedBy, layoutUploadedAt: uploadedAt, layoutFileName: file.name } : d));
    } catch (e: any) {
      alert(`Error subiendo LAYOUT: ${e.message}`);
    } finally {
      setUploadingFor(null);
    }
  };

  const handleUploadCCP = async (recordId: string, numeroCaja: string, file: File) => {
    try {
      setUploadingFor(recordId);
      const ext = file.name.split('.').pop() || 'file';
      const ts = nowMX().replace(/[:.-]/g, '');
      const filename = `CCP_${numeroCaja}_${ts}.${ext}`;
      const uploadResult = await uploadFileToDrive(file, filename, EMBARQUES_FOLDER_ID);
      const url = uploadResult?.webViewLink || '';
      const driveFileId = uploadResult?.id || '';
      const uploadedBy = user?.email || user?.name || 'Desconocido';
      const uploadedAt = nowMX();

      // Sincronizar con Asignación Diaria de Cajas — dual-key fallback para mayor robustez
      const record = data.find(d => d.id === recordId);
      const asigPromise: Promise<any> = (record?.numeroOperacion || record?.numeroCaja)
        ? (async () => {
            // Intento 1: buscar por numeroOperacion (más específico)
            let asigDoc = record?.numeroOperacion
              ? await asignacionCajaService.getAsignacionByNumeroOperacion(record.numeroOperacion)
              : null;

            // Intento 2: fallback por numeroCaja si el primer intento no encontró nada
            if (!asigDoc && record?.numeroCaja) {
              asigDoc = await asignacionCajaService.getAsignacionByNumeroCaja(record.numeroCaja);
            }

            if (asigDoc && asigDoc.id) {
              const asigUpdates: any = {
                ccpUrl: url,
                ccpUploadedBy: uploadedBy,
                ccpUploadedAt: uploadedAt,
                ccpFileName: filename,
                ccpFileId: driveFileId,
              };
              return asignacionCajaService.updateAsignacion(asigDoc.id, asigUpdates);
            } else {
              console.warn('[CCP Embarques] No se encontró asignación para sincronizar. numeroOperacion:', record?.numeroOperacion, '| numeroCaja:', record?.numeroCaja);
            }
          })()
        : Promise.resolve();

      await Promise.all([
        contratoService.updateContrato(recordId, {
          ccpUrl: url,
          ccpUploadedBy: uploadedBy,
          ccpUploadedAt: uploadedAt,
          ccpFileName: filename
        }),
        asigPromise
      ]);

      setData(prev => prev.map(d => d.id === recordId ? { ...d, ccpUrl: url, ccpUploadedBy: uploadedBy, ccpUploadedAt: uploadedAt, ccpFileName: filename } : d));
    } catch (e: any) {
      alert(`Error subiendo CCP: ${e.message}`);
    } finally {
      setUploadingFor(null);
    }
  };

  const handleUploadAnexo29 = async (recordId: string, numeroCaja: string, file: File) => {
    try {
      setUploadingFor(recordId);
      const ext = file.name.split('.').pop() || 'file';
      const ts = nowMX().replace(/[:.-]/g, '');
      const filename = `ANEXO29_${numeroCaja}_${ts}.${ext}`;
      const result = await uploadFileToDrive(file, filename, EMBARQUES_FOLDER_ID);
      const url = result?.webViewLink || '';
      const uploadedBy = user?.email || user?.name || 'Desconocido';
      const uploadedAt = nowMX();

      // Sincronizar con Asignación Diaria de Cajas — dual-key fallback
      const record = data.find(d => d.id === recordId);
      const asigPromise: Promise<any> = (record?.numeroOperacion || record?.numeroCaja)
        ? (async () => {
            let asigDoc = record?.numeroOperacion
              ? await asignacionCajaService.getAsignacionByNumeroOperacion(record.numeroOperacion)
              : null;
            if (!asigDoc && record?.numeroCaja) {
              asigDoc = await asignacionCajaService.getAsignacionByNumeroCaja(record.numeroCaja);
            }
            if (asigDoc && asigDoc.id) {
              return asignacionCajaService.updateAsignacion(asigDoc.id, {
                anexo29Url: url,
                anexo29UploadedBy: uploadedBy,
                anexo29UploadedAt: uploadedAt,
                anexo29FileName: file.name,
              });
            } else {
              console.warn('[Anexo29 Embarques] No se encontró asignación. numeroOperacion:', record?.numeroOperacion, '| numeroCaja:', record?.numeroCaja);
            }
          })()
        : Promise.resolve();

      await Promise.all([
        contratoService.updateContrato(recordId, {
          anexo29Url: url,
          anexo29UploadedBy: uploadedBy,
          anexo29UploadedAt: uploadedAt,
          anexo29FileName: file.name,
        }),
        asigPromise
      ]);

      setData(prev => prev.map(d => d.id === recordId ? { ...d, anexo29Url: url, anexo29UploadedBy: uploadedBy, anexo29UploadedAt: uploadedAt, anexo29FileName: file.name } : d));
    } catch (e: any) {
      alert(`Error subiendo Anexo29: ${e.message}`);
    } finally {
      setUploadingFor(null);
    }
  };

  const handleCierreRow = async (id: string) => {
    try {
      await contratoService.updateContrato(id, { cerrado: true });
      setData(prev => prev.map(d => d.id === id ? { ...d, cerrado: true } : d));
    } catch (error) {
      console.error(error);
      alert('Error cerrando el registro');
    }
  };

  const handleAssign = async () => {
    if (selectedIds.size === 0) return;
    setIsAssigning(true);
    const assigneeName = user?.email || user?.name || 'Desconocido';
    try {
      const selectedRecords = data.filter(d => selectedIds.has(d.id!));
      const libres = selectedRecords.filter(d => !d.asignadoA);
      const conflictos = selectedRecords.filter(d => !!d.asignadoA);

      // Asignar los libres directamente
      for (const record of libres) {
        await contratoService.updateContrato(record.id!, { asignadoA: assigneeName });
      }

      if (conflictos.length > 0) {
        setReassignConflicts(conflictos.map(c => ({
          id: c.id!,
          numeroCaja: c.numeroCaja || c.numeroOperacion || 'N/A',
          asignadoA: c.asignadoA!
        })));
        
        if (user?.role === UserRole.ADMIN) {
          setPendingForceIds(conflictos.map(c => c.id!));
          setShowReassignModal(true);
        } else {
          setShowReassignModal(true);
        }
      } else {
        setSelectedIds(new Set());
      }
      
      if (libres.length > 0 && conflictos.length > 0) {
        // Limpiar los libres de los selectedIds, dejar los conflictos seleccionados para visualizarlos
        const newSelected = new Set(selectedIds);
        libres.forEach(l => newSelected.delete(l.id!));
        setSelectedIds(newSelected);
        // refresca para ver los que sí se asignaron (ya manejado por onSnapshot)
      }
    } catch (error) {
      console.error("Error assigning records:", error);
      alert("Hubo un error al asignar los registros.");
    } finally {
      setIsAssigning(false);
    }
  };

  const handleForceAssign = async () => {
    if (pendingForceIds.length === 0) return;
    setIsAssigning(true);
    const assigneeName = user?.email || user?.name || 'Desconocido';
    try {
      for (const id of pendingForceIds) {
        await contratoService.updateContrato(id, { asignadoA: assigneeName });
      }
      setSelectedIds(new Set());
      setShowReassignModal(false);
      setPendingForceIds([]);
      setReassignConflicts([]);
    } catch (error) {
      console.error("Error force assigning records:", error);
      alert("Hubo un error al forzar la asignación de registros.");
    } finally {
      setIsAssigning(false);
    }
  };


  const fetchData = async () => {
    setLoading(true);
    setSelectedIds(new Set());
    try {
      // FIX-B: dealers se cargan solo la primera vez (caché en ref)
      const dealersPromise = dealersCache.current.length > 0
        ? Promise.resolve(dealersCache.current)
        : storageService.getAllDealers().catch(() => []);

      // FIX-C: check-ins limitados a últimos 7 días — evita full scan histórico
      const checkInCutoff = new Date();
      checkInCutoff.setDate(checkInCutoff.getDate() - 7);
      const checkInCutoffISO = checkInCutoff.toISOString();

      const [asigData, asignaciones, sellos, checkIns, dealersData] = await Promise.all([
        contratoService.getContratosByDateRange(startDate, endDate),
        asignacionCajaService.getAsignacionesByDateRange(startDate, endDate).catch(() => []),
        selloService.getSellosByDateRange(startDate, endDate).catch(() => []),
        checkInService.getUnprocessedCheckIns(checkInCutoffISO).catch(() => []),
        dealersPromise
      ]);
      if (dealersData.length > 0) {
        dealersCache.current = dealersData;
        setDealers(dealersData);
      }
      
      const mergedData = asigData.map(c => {
        const a = asignaciones.find(x => x.numeroOperacion === c.numeroOperacion);
        
        let selloFinal = c.selloAsignado;
        if (!selloFinal && a) {
           const sRow = sellos.find(s => s.asignacionCajaId === a.id || (s.numeroCaja === a.numeroCaja && s.fechaAsignacion === a.fecha));
           if (sRow) selloFinal = sRow.selloAsignado;
        }

        return { 
          ...c, 
          selloAsignado: selloFinal,
          scac: (a as any)?.scac || a?.carrierCodigo || '',
          carrierRef: a?.carrierRef || '',
          observaciones: a?.observaciones || '',
          dealerAsignado: a?.dealerAsignado || a?.modeloAsignado || ''
        };
      });
      
      // DEDUPLICATION GUARD: Remove exact Firestore document duplicates by ID
      const deduped = Array.from(new Map(mergedData.map(r => [r.id, r])).values());
      
      setData(deduped);
      setCheckInsData(checkIns);
      
      const initialDocks: Record<string, string> = {};
      checkIns.forEach(c => {
        let dock = c.dockAsignado;
        if (!dock) {
          const asig = asignaciones.find(a => 
            (c.asignacionCajaId && a.id === c.asignacionCajaId) || 
            (c.numeroOperacion && a.numeroOperacion === c.numeroOperacion)
          );
          if (asig && asig.dockArribo) {
            dock = asig.dockArribo;
          }
        }
        if (c.id && dock) initialDocks[c.id] = dock;
      });
      setDocks(initialDocks);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchVinReports = async () => {
    try {
      const reports = await vinReportService.getAllVinReports();
      setVinReports(reports);
    } catch (error) {
      console.error("Error fetching VIN reports:", error);
    }
  };

  const handleSyncVins = async () => {
    setIsSyncingVins(true);
    try {
      await vinReportService.generateVinReports(startDate, endDate);
      await fetchVinReports();
      alert('Sincronización de VINs completada exitosamente.');
    } catch (error: any) {
      console.error(error);
      alert('Error al sincronizar VINs: ' + error.message);
    } finally {
      setIsSyncingVins(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'REPORTEO_VINS' && vinReports.length === 0) {
      fetchVinReports();
    }
  }, [activeTab]);

  useEffect(() => {
    let cancelled = false;

    const safeFetch = async () => {
      if (cancelled) return;
      await fetchData();
    };

    safeFetch();

    const handleRefresh = () => {
      safeFetch();
    };

    window.addEventListener('data:refresh', handleRefresh);
    // NOTE: 'reserva:changed' was intentionally removed — it's dispatched
    // by AsignacionesDiarias on every date change, causing infinite reload loops.

    return () => {
      cancelled = true;
      window.removeEventListener('data:refresh', handleRefresh);
    };
  }, [startDate, endDate]);

  useEffect(() => {
    // Suscripción silenciosa para actualizaciones en tiempo real de 'asignadoA' y 'cerrado'
    const unsubscribe = contratoService.subscribeContratosByDateRange(startDate, endDate, (updatedContratos) => {
      setData(prev => {
        let hasChanges = false;
        const newData = prev.map(item => {
          const updatedMatch = updatedContratos.find(u => u.id === item.id);
          if (updatedMatch) {
            if (item.asignadoA !== updatedMatch.asignadoA || item.cerrado !== updatedMatch.cerrado) {
              hasChanges = true;
              return { ...item, asignadoA: updatedMatch.asignadoA, cerrado: updatedMatch.cerrado };
            }
          }
          return item;
        });
        return hasChanges ? newData : prev;
      });
    });

    return () => {
      unsubscribe();
    };
  }, [startDate, endDate]);

  const availableDealers = useMemo(() => {
    return dealers.map(d => ({ 
      id: d.idDealer, 
      label: `${d.idDealer} - ${d.shipTo || d.idDealer}` 
    })).sort((a, b) => a.label.localeCompare(b.label));
  }, [dealers]);

  const filteredData = useMemo(() => {
    return data.filter(item => {
      if (activeTab === 'CON_LAYOUT' && !item.layoutUrl) return false;
      if (activeTab === 'CON_CCP' && !item.ccpUrl) return false;
      if (activeTab === 'SIN_CIERREEMB' && item.cerrado) return false;
      if (dealerFilter !== 'ALL' && item.dealerAsignado !== dealerFilter) return false;

      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const sello = (item.selloAsignado || '').toLowerCase();
        const match = (item.numeroOperacion || '').toLowerCase().includes(term) ||
                      (item.numeroCaja || '').toLowerCase().includes(term) ||
                      (item.contrato || '').toLowerCase().includes(term) ||
                      sello.includes(term);
        if (!match) return false;
      }
      return true;
    });
  }, [data, activeTab, searchTerm]);

  const sortedData = useMemo(() => {
    const sorted = [...filteredData];
    if (sortConfig) {
      sorted.sort((a, b) => {
        let valA: string = (a[sortConfig.key as keyof ContratoRecord] || '').toString().toLowerCase();
        let valB: string = (b[sortConfig.key as keyof ContratoRecord] || '').toString().toLowerCase();

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sorted;
  }, [filteredData, sortConfig]);

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
            ? <ChevronUp size={14} className="text-indigo-600" /> 
            : <ChevronDown size={14} className="text-indigo-600" />;
    }
    return <ChevronUp size={14} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />;
  };

  const SortableHeader = ({ label, sortKey, className = "" }: { label: string, sortKey: string, className?: string }) => (
    <th className={`py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 ${className}`}>
      <div 
        onClick={() => handleSort(sortKey)} 
        className={`flex items-center gap-1 cursor-pointer hover:text-indigo-600 transition-colors group select-none ${className.includes('text-center') ? 'justify-center' : ''} ${sortConfig?.key === sortKey ? 'text-indigo-700 font-bold' : ''}`}
      >
        {label}
        {renderSortIcon(sortKey)}
      </div>
    </th>
  );

  // toggleSelectAll moved down below filteredCheckIns

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleAssignDock = async (checkInId: string) => {
    const dock = docks[checkInId];
    if (!dock) return;
    try {
      const checkIn = checkInsData.find(c => c.id === checkInId);
      if (!checkIn) return;
      
      await checkInService.markAsProcessed(checkInId, dock);
      
      if (checkIn.asignacionCajaId) {
        const getNowTime = () => {
          const now = new Date();
          return now.toLocaleTimeString('es-MX', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'America/Mexico_City'
          });
        };
        await asignacionCajaService.updateAsignacion(checkIn.asignacionCajaId, {
           arribo: getNowTime(),
           arriboAt: nowMX(),
           arriboBy: user?.email || 'Embarques',
           dockArribo: dock,
           checkInStatus: checkIn.checkInStatus,
           checkInAt: checkIn.checkInAt
        } as any);
      }
      
      alert('Dock asignado y Arribo registrado exitosamente.');
      await fetchData();
    } catch (e) {
      alert('Error asignando dock');
    }
  };

  const filteredCheckIns = checkInsData.filter(a => {
    // Use toMXDate to convert any stored timestamp to Mexico local date before comparing
    const checkInDate = toMXDate(a.checkInAt || '');
    if (checkInDate && (checkInDate < startDate || checkInDate > endDate)) return false;

    if (checkInFilter === 'CON_CITA') {
      if (a.checkInStatus && a.checkInStatus !== 'PUNTUAL / OK') return false;
    } else if (checkInFilter === 'SIN_CITA') {
      if (a.checkInStatus !== 'SIN CITA') return false;
    } else if (checkInFilter === 'CON_ERRORES') {
      if (a.checkInStatus !== 'CITA CON POSIBLE ERROR') return false;
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const match = (a.numeroOperacion || '').toLowerCase().includes(term) ||
                    (a.numeroCaja || '').toLowerCase().includes(term) ||
                    (a.placasTracto || '').toLowerCase().includes(term) ||
                    (a.transportista || '').toLowerCase().includes(term);
      if (!match) return false;
    }
    return true;
  });

  const toggleSelectAll = () => {
    if (activeTab === 'CHECK_IN') {
      if (selectedIds.size === filteredCheckIns.length && filteredCheckIns.length > 0) {
        setSelectedIds(new Set());
      } else {
        setSelectedIds(new Set(filteredCheckIns.map(item => item.id!)));
      }
    } else {
      if (selectedIds.size === sortedData.length && sortedData.length > 0) {
        setSelectedIds(new Set());
      } else {
        setSelectedIds(new Set(sortedData.map(item => item.id!)));
      }
    }
  };

  const handleDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`¿Estás seguro de que deseas eliminar ${selectedIds.size} registro(s)?`)) return;

    setIsDeleting(true);
    try {
      if (activeTab === 'CHECK_IN') {
        for (const id of selectedIds) {
          await checkInService.deleteCheckIn(id);
        }
      } else {
        for (const id of selectedIds) {
          await contratoService.deleteContrato(id);
        }
      }
      setSelectedIds(new Set());
      await fetchData();
    } catch (error) {
      console.error("Error deleting records:", error);
      alert("Hubo un error al eliminar los registros.");
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredVinReports = useMemo(() => {
    let result = vinReports;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(item => 
        item.containerNo.toLowerCase().includes(term) ||
        item.sealNo.toLowerCase().includes(term) ||
        item.vinNo.toLowerCase().includes(term) ||
        item.model.toLowerCase().includes(term) ||
        item.orderNo.toLowerCase().includes(term) ||
        item.invoiceNo.toLowerCase().includes(term)
      );
    }
    
    if (queryConditions.length > 0) {
      result = result.filter(item => {
        return queryConditions.every(cond => {
          if (!cond.input && cond.input !== 0) return true;
          const val = (item[cond.column as keyof VinReportRecord] || '').toString().toLowerCase();
          const target = cond.input.toString().toLowerCase();
          
          if (cond.operator === 'in') {
            const list = target.split(/[\s,]+/).filter(Boolean);
            return list.some((t: string) => val.includes(t));
          }
          if (cond.operator === '==') return val === target;
          if (cond.operator === '!=') return val !== target;
          if (cond.operator === 'contains') return val.includes(target);
          return true;
        });
      });
    }

    return result;
  }, [vinReports, searchTerm, queryConditions]);

  const exportToExcel = () => {
    if (activeTab === 'REPORTEO_VINS') {
      const exportData = filteredVinReports.map(item => ({
        'CONTAINER NO': item.containerNo,
        'SEAL No.': item.sealNo,
        'MODEL': item.model,
        'REF': item.ref,
        'Product No.': item.productNo,
        'VIN No.': item.vinNo,
        'ENGINE No.': item.engineNo,
        'Production Date': item.productionDate,
        'COLOR': item.color,
        'ORDER NO': item.orderNo,
        'Invoice': item.invoiceNo,
        'Shipping Date': item.shippingDate,
        'Plataformas': item.plataformas
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Reporteo Vins');
      XLSX.writeFile(wb, `Reporteo_Vins_${startDate}_al_${endDate}.xlsx`);
      return;
    }

    const exportData = sortedData.map(item => ({
      'NO. OPERACIÓN': item.numeroOperacion || '',
      'NÚMERO CAJA': item.numeroCaja || '',
      'SELLO ASIGNADO': item.selloAsignado || '',
      'CONTRATO': item.contrato || '',
      'ASIGNADO': item.asignadoA || ''
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Embarques');
    XLSX.writeFile(wb, `Embarques_${startDate}_al_${endDate}.xlsx`);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 w-full overflow-hidden relative">
      {/* Header */}
      <div className="shrink-0 px-6 py-6 border-b border-slate-200 bg-white">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl shrink-0">
            <Package size={24} />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">{t('emb.title')}</h1>
            <p className="text-slate-500 text-sm mt-1">
              {t('emb.subtitle')}
            </p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="shrink-0 px-6 py-4 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-4">
        
        <div className="flex items-center gap-4">
          {/* Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-lg">
            {!isCarrier && (
              <>
                <button
              onClick={() => setActiveTab('TODOS')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                activeTab === 'TODOS' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              {t('emb.tab.todos')} <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-bold">{data.length}</span>
            </button>
            <button
              onClick={() => setActiveTab('CON_LAYOUT')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                activeTab === 'CON_LAYOUT' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              {t('emb.tab.con_layout')} <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-bold">{data.filter(d => !!d.layoutUrl).length}</span>
            </button>
            <button
              onClick={() => setActiveTab('CON_CCP')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                activeTab === 'CON_CCP' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              {t('emb.tab.con_ccp')} <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-bold">{data.filter(d => !!d.ccpUrl).length}</span>
            </button>
            <button
              onClick={() => setActiveTab('SIN_CIERREEMB')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                activeTab === 'SIN_CIERREEMB' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              {t('emb.tab.sin_cierre')} <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-bold">{data.filter(d => !d.cerrado).length}</span>
            </button>
              </>
            )}
            <button
              onClick={() => setActiveTab('CHECK_IN')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                activeTab === 'CHECK_IN' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              Check in <span className={`${activeTab === 'CHECK_IN' ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-600'} px-1.5 py-0.5 rounded text-[10px] font-bold`}>
                {checkInsData.filter(a => {
                  const d = toMXDate(a.checkInAt || '');
                  return !d || (d >= startDate && d <= endDate);
                }).length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('REPORTEO_VINS')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                activeTab === 'REPORTEO_VINS' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              <Database size={16} className={activeTab === 'REPORTEO_VINS' ? 'text-indigo-200' : ''} />
              Reporteo Vins <span className={`${activeTab === 'REPORTEO_VINS' ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-600'} px-1.5 py-0.5 rounded text-[10px] font-bold`}>
                {vinReports.length}
              </span>
            </button>
          </div>
          
          {activeTab === 'CHECK_IN' && (
            <select
              value={checkInFilter}
              onChange={(e) => setCheckInFilter(e.target.value as any)}
              className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">{t('emb.filter.todos')}</option>
              <option value="CON_CITA">{t('emb.filter.con_cita')}</option>
              <option value="SIN_CITA">{t('emb.filter.sin_cita')}</option>
              <option value="CON_ERRORES">{t('emb.filter.con_errores')}</option>
            </select>
          )}

          {activeTab !== 'CHECK_IN' && availableDealers.length > 0 && (
            <select 
              value={dealerFilter}
              onChange={(e) => setDealerFilter(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-indigo-500 font-medium shadow-sm w-48 truncate"
            >
              <option value="ALL">TODOS LOS DEALERS</option>
              {availableDealers.map(d => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          )}

          {selectedIds.size > 0 && (
            <>
              <button
                onClick={handleDelete}
                disabled={isDeleting || isAssigning || (user?.role !== UserRole.ADMIN && user?.role !== UserRole.EXPO_COORDINATOR)}
                title={(user?.role !== UserRole.ADMIN && user?.role !== UserRole.EXPO_COORDINATOR) ? "Sólo el administrador o Expo Coordinator pueden borrar" : ""}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {isDeleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                Borrar ({selectedIds.size})
              </button>
              {activeTab !== 'CHECK_IN' && (
                <button
                  onClick={handleAssign}
                  disabled={isDeleting || isAssigning}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {isAssigning ? <Loader2 size={18} className="animate-spin" /> : <UserCheck size={18} />}
                  Asignar ({selectedIds.size})
                </button>
              )}
            </>
          )}
        </div>

        {/* Search & Actions */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text"
              placeholder="Buscar caja, OP o contrato..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64"
            />
          </div>

          <div className="flex items-center bg-white border border-slate-300 rounded-lg overflow-hidden">
            <button
              onClick={() => {
                const today = todayMX();
                setStartDate(today);
                setEndDate(today);
              }}
              className="px-3 py-2 text-xs font-bold text-indigo-600 bg-indigo-50 border-r border-slate-300 hover:bg-indigo-100 transition-colors"
            >
              HOY
            </button>
            <div className="px-3 py-2 border-r border-slate-300 bg-slate-50 text-slate-500">
              <Calendar size={18} />
            </div>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="px-3 py-2 text-sm focus:outline-none"
            />
            <span className="text-slate-400">-</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="px-3 py-2 text-sm focus:outline-none"
            />
          </div>

          <button 
            onClick={fetchData}
            className="p-2 text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            title="Recargar"
          >
            <RefreshCw size={18} className={loading ? "animate-spin text-indigo-500" : ""} />
          </button>
          
          {activeTab === 'REPORTEO_VINS' && (
            <>
              <button 
                onClick={() => setQueryBuilderOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 rounded-lg text-sm font-medium transition-colors"
              >
                <Database size={18} />
                Consultas Avanzadas
              </button>
              <button 
                onClick={handleSyncVins}
                disabled={isSyncingVins}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                <RefreshCw size={18} className={isSyncingVins ? "animate-spin" : ""} />
                Sincronizar VINs
              </button>
            </>
          )}

          <button 
            onClick={exportToExcel}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-sm font-medium transition-colors"
          >
            <Download size={18} />
            Exportar
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 relative p-6">
        <div className="absolute inset-x-6 inset-y-0 bottom-6 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto">
            {activeTab === 'CHECK_IN' ? (
              <table className="w-full text-left border-collapse min-w-max">
                <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="py-3 px-4 w-12 border-b border-slate-200">
                      <input 
                        type="checkbox" 
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        checked={filteredCheckIns.length > 0 && selectedIds.size === filteredCheckIns.length}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">{t('emb.col.arribo')}</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">{t('emb.col.operacion')}</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">{t('emb.col.caja')}</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">{t('emb.col.linea')}</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">{t('emb.col.scac')}</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">{t('emb.col.carrier_ref')}</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">{t('emb.col.celular')}</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">{t('emb.col.estatus')}</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-right">{t('emb.col.asignar_dock')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center">
                        <Loader2 className="animate-spin text-indigo-500 mx-auto" size={32} />
                        <p className="text-slate-500 mt-2 text-sm">Cargando check-ins...</p>
                      </td>
                    </tr>
                  ) : filteredCheckIns.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-500">
                        {t('emb.empty')}
                      </td>
                    </tr>
                  ) : (
                    filteredCheckIns.map(a => (
                      <tr key={a.id} className={`transition-colors ${selectedIds.has(a.id!) ? 'bg-indigo-50/50' : 'hover:bg-slate-50/50'}`}>
                        <td className="py-3 px-4 border-b border-slate-100">
                          <input 
                            type="checkbox" 
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            checked={selectedIds.has(a.id!)}
                            onChange={() => toggleSelect(a.id!)}
                          />
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-semibold text-slate-700">{new Date(a.checkInAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit'})}</span>
                          <div className="text-xs text-slate-400">{new Date(a.checkInAt).toLocaleDateString('es-MX')}</div>
                          {a.horaAgendada && (
                            <div className="mt-1 text-[10px] bg-slate-100 text-slate-500 px-1 py-0.5 rounded inline-block">
                              Cita: {a.horaAgendada}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-sm">
                          <div>{a.numeroOperacion}</div>
                          {a.fechaAgendada && <div className="text-[10px] text-slate-400">{a.fechaAgendada}</div>}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold">{a.numeroCaja} <span className="text-slate-400 font-normal">/ {a.placasTracto || 'S/N'}</span></div>
                          {a.nombreDriver && <div className="text-xs text-slate-500 truncate max-w-[150px]" title={a.nombreDriver}>{a.nombreDriver}</div>}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-sm truncate max-w-[200px]" title={a.transportista}>{a.transportista || 'N/A'}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-sm font-mono text-slate-600">{a.scac || 'N/A'}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-sm text-slate-600">{a.carrierRef || 'S/N'}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-sm text-slate-600 font-medium">{a.celular || 'S/N'}</div>
                        </td>
                        <td className="py-3 px-4">
                          {a.checkInStatus === 'SIN CITA' ? (
                            <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-bold">SIN CITA</span>
                          ) : a.checkInStatus === 'CITA CON POSIBLE ERROR' ? (
                            <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs font-bold">POSIBLE ERROR</span>
                          ) : (
                            <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-bold">{a.checkInStatus || 'OK'}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right flex items-center justify-end gap-2">
                          <select
                            value={docks[a.id!] || ''}
                            onChange={(e) => setDocks({ ...docks, [a.id!]: e.target.value })}
                            disabled={isCarrier}
                            className={`border border-slate-300 rounded px-2 py-1 text-sm bg-white ${isCarrier ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            <option value="">{t('emb.dock.select')}</option>
                            {Array.from({ length: 13 }, (_, i) => `DOCK ${i + 1}`).map(d => (
                              <option key={d} value={d}>{d}</option>
                            ))}
                          </select>
                            <button
                              onClick={() => handleAssignDock(a.id!)}
                              disabled={!docks[a.id!] || isCarrier}
                              className="px-3 py-1 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {t('emb.btn.guardar')}
                            </button>
                          {!isCarrier && (
                            <button
                              onClick={() => {
                                const dockStr = docks[a.id!] || '___';
                                const numDock = dockStr.replace('DOCK ', '');
                                const text = `Chofer: ${a.nombreDriver || 'N/A'}\nNo. Operación: ${a.numeroOperacion || 'S/N'}\nCaja: ${a.numeroCaja || 'S/N'}\nIngresar a Dock: ${numDock}\nPlanta: 5`;
                                window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                              }}
                              title="Notificar por WhatsApp"
                              className="p-1.5 bg-[#25D366] text-white rounded transition-colors shadow-sm hover:bg-[#128C7E]"
                            >
                              <MessageCircle size={18} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : activeTab === 'REPORTEO_VINS' ? (
              <table className="w-full text-left border-collapse min-w-max">
                <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Container No</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Seal No</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Model</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Ref</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">VIN No</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Color</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Order No</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Invoice</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Shipping Date</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Plataformas</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">UUID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredVinReports.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-500">
                        {searchTerm || (queryConditions.length > 0 && queryConditions[0].input !== '') ? 'No se encontraron resultados' : 'No hay VINs registrados o sincronizados.'}
                      </td>
                    </tr>
                  ) : (
                    filteredVinReports.map(vin => (
                      <tr key={vin.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-4 border-b border-slate-100 text-sm">{vin.containerNo}</td>
                        <td className="py-3 px-4 border-b border-slate-100 text-sm font-medium">{vin.sealNo}</td>
                        <td className="py-3 px-4 border-b border-slate-100 text-sm text-slate-600">{vin.model}</td>
                        <td className="py-3 px-4 border-b border-slate-100 text-sm">{vin.ref}</td>
                        <td className="py-3 px-4 border-b border-slate-100 text-sm text-indigo-600 font-mono font-medium">{vin.vinNo}</td>
                        <td className="py-3 px-4 border-b border-slate-100 text-sm">{vin.color}</td>
                        <td className="py-3 px-4 border-b border-slate-100 text-sm">{vin.orderNo}</td>
                        <td className="py-3 px-4 border-b border-slate-100 text-sm">{vin.invoiceNo}</td>
                        <td className="py-3 px-4 border-b border-slate-100 text-sm">{vin.shippingDate}</td>
                        <td className="py-3 px-4 border-b border-slate-100 text-sm text-slate-500 max-w-xs truncate" title={vin.plataformas}>{vin.plataformas}</td>
                        <td className="py-3 px-4 border-b border-slate-100 text-xs font-mono text-slate-400 max-w-[120px] truncate" title={(vin as any).uuid || ''}>{(vin as any).uuid || 'N/A'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left border-collapse min-w-max">
                <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="py-3 px-4 w-12 border-b border-slate-200">
                    {!isCarrier && (
                      <input 
                        type="checkbox" 
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        checked={sortedData.length > 0 && selectedIds.size === sortedData.length}
                        onChange={toggleSelectAll}
                      />
                    )}
                  </th>
                  <SortableHeader label="No. Operación" sortKey="numeroOperacion" />
                  <SortableHeader label="Registro" sortKey="createdAt" />
                  <SortableHeader label="Caja" sortKey="numeroCaja" />
                  <SortableHeader label="Sello Asignado" sortKey="selloAsignado" />
                  <SortableHeader label="Carrier Ref" sortKey="carrierRef" />
                  <SortableHeader label="Observaciones" sortKey="observaciones" />
                  <SortableHeader label="SCAC" sortKey="scac" />
                  <SortableHeader label="Contrato" sortKey="contrato" />
                  <SortableHeader label="FACTURA" sortKey="factura" />
                  <SortableHeader label="XML" sortKey="xmlUUID" className="text-center bg-amber-50/40" />
                  <SortableHeader label="LAYOUT" sortKey="layoutUrl" className="text-center bg-indigo-50/40" />
                  <SortableHeader label="CCP" sortKey="ccpUrl" className="text-center bg-sky-50/40" />
                  <SortableHeader label="ANEXO 29" sortKey="anexo29Url" className="text-center bg-emerald-50/40" />
                  <SortableHeader label="Asignado" sortKey="asignadoA" />
                  <SortableHeader label="CIERREEMB" sortKey="cerrado" className="text-center" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={15} className="py-12 text-center">
                      <Loader2 className="animate-spin text-indigo-500 mx-auto" size={32} />
                      <p className="text-slate-500 mt-2 text-sm">Cargando contratos...</p>
                    </td>
                  </tr>
                ) : sortedData.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="py-12 text-center text-slate-500">
                      No se encontraron registros en estas fechas.
                    </td>
                  </tr>
                ) : (
                  sortedData.map((item) => (
                    <tr 
                      key={item.id} 
                      className={`hover:bg-slate-50 transition-colors ${item.cerrado ? 'bg-emerald-200/60' : item.asignadoA ? 'bg-amber-50' : selectedIds.has(item.id!) ? 'bg-indigo-50/30' : ''}`}
                    >
                      <td className="py-3 px-4">
                        {!isCarrier && (
                          <input 
                            type="checkbox"
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            checked={selectedIds.has(item.id!)}
                            onChange={() => toggleSelect(item.id!)}
                          />
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm font-medium text-slate-900">
                        {item.numeroOperacion || '-'}
                      </td>
                      <td className="py-3 px-4">
                        {item.createdAt ? (
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold text-slate-700">
                              {new Date(item.createdAt).toLocaleDateString('es-MX', { timeZone: 'America/Monterrey' })}
                            </span>
                            <span className="text-xs text-slate-500 font-mono">
                              {new Date(item.createdAt).toLocaleTimeString('es-MX', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm font-medium text-slate-900">
                        {item.numeroCaja || '-'}
                      </td>
                      <td className="py-3 px-4 text-sm font-medium text-slate-900">
                        {item.selloAsignado || '-'}
                      </td>
                      <td className="py-3 px-4 text-sm font-medium text-slate-900">
                        {item.carrierRef || '-'}
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-600 max-w-xs truncate" title={item.observaciones}>
                        {item.observaciones || '-'}
                      </td>
                      <td className="py-3 px-4 text-sm font-medium text-orange-600">
                        {item.scac || '-'}
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <div className="flex flex-col gap-1.5 items-start">
                          {item.contrato ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 font-medium border border-emerald-100">
                              {item.fotoUrlContrato1 && item.fotoUrlContrato1 !== 'PENDING' ? (
                                <a href={item.fotoUrlContrato1} target="_blank" rel="noreferrer" className="hover:underline">{item.contrato}</a>
                              ) : (
                                <>
                                  {item.contrato}
                                  {item.fotoUrlContrato1 === 'PENDING' && <Loader2 size={12} className="animate-spin text-emerald-400" />}
                                </>
                              )}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Sin capturar</span>
                          )}
                          {item.contrato2 && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 font-medium border border-emerald-100">
                              {item.fotoUrlContrato2 && item.fotoUrlContrato2 !== 'PENDING' ? (
                                <a href={item.fotoUrlContrato2} target="_blank" rel="noreferrer" className="hover:underline">{item.contrato2}</a>
                              ) : (
                                <>
                                  {item.contrato2}
                                  {item.fotoUrlContrato2 === 'PENDING' && <Loader2 size={12} className="animate-spin text-emerald-400" />}
                                </>
                              )}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        {item.factura ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 font-medium border border-amber-200">
                            {item.fotoUrlFactura && item.fotoUrlFactura !== 'PENDING' ? (
                              <a href={item.fotoUrlFactura} target="_blank" rel="noreferrer" className="hover:underline">{item.factura}</a>
                            ) : (
                              <>
                                {item.factura}
                                {item.fotoUrlFactura === 'PENDING' && <Loader2 size={12} className="animate-spin text-amber-400" />}
                              </>
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-300 italic text-xs">—</span>
                        )}
                      </td>
                      {/* XML */}
                      <td className="py-3 px-4 text-center bg-amber-50/20 border-l border-amber-100/50">
                        {uploadingFor === item.id ? (
                          <Loader2 size={18} className="animate-spin text-amber-400 mx-auto" />
                        ) : item.xmlUUID ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <div className="flex items-center justify-center gap-1" title={item.xmlUUID}>
                              <span className="inline-flex items-center justify-center p-1.5 rounded-lg text-emerald-600 font-bold bg-emerald-100">
                                XML OK
                              </span>
                              {!isCarrier && (
                                <label className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-100 transition-colors cursor-pointer"
                                       title="Reemplazar XML">
                                  <UploadCloud size={16} />
                                  <input type="file" accept=".xml" className="hidden"
                                         onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadXML(item.id!, item.factura || '', f); e.target.value = ''; }} />
                                </label>
                              )}
                            </div>
                            {item.xmlUploadedAt && (
                              <span className="text-[10px] text-amber-500 font-mono whitespace-nowrap">
                                {new Date(item.xmlUploadedAt).toLocaleDateString('es-MX', { timeZone: 'America/Monterrey', day: '2-digit', month: '2-digit' })} {new Date(item.xmlUploadedAt).toLocaleTimeString('es-MX', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit', hour12: false })}
                              </span>
                            )}
                          </div>
                        ) : !isCarrier ? (
                          <label className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-300 hover:text-amber-500 hover:bg-amber-50 transition-colors cursor-pointer"
                                 title="Subir XML">
                            <FileText size={18} />
                            <input type="file" accept=".xml" className="hidden"
                                   onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadXML(item.id!, item.factura || '', f); e.target.value = ''; }} />
                          </label>
                        ) : (
                          <span className="text-slate-300 italic">—</span>
                        )}
                      </td>
                      {/* LAYOUT */}
                      <td className="py-3 px-4 text-center bg-indigo-50/20 border-l border-indigo-100/50">
                        {uploadingFor === item.id ? (
                          <Loader2 size={18} className="animate-spin text-indigo-400 mx-auto" />
                        ) : item.layoutUrl ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <div className="flex items-center justify-center gap-1">
                              <a href={toDriveDownload(item.layoutUrl)} target="_blank" rel="noreferrer"
                                 className="inline-flex items-center justify-center p-1.5 rounded-lg text-blue-600 hover:bg-blue-100 transition-colors"
                                 title="Descargar LAYOUT">
                                <FileText size={18} />
                              </a>
                              {!isCarrier && (
                                <label className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-100 transition-colors cursor-pointer"
                                       title="Reemplazar LAYOUT">
                                  <UploadCloud size={16} />
                                  <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
                                         onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadLayout(item.id!, item.numeroCaja, f); e.target.value = ''; }} />
                                </label>
                              )}
                            </div>
                            {item.layoutUploadedAt && (
                              <span className="text-[10px] text-indigo-400 font-mono whitespace-nowrap">
                                {new Date(item.layoutUploadedAt).toLocaleDateString('es-MX', { timeZone: 'America/Monterrey', day: '2-digit', month: '2-digit' })} {new Date(item.layoutUploadedAt).toLocaleTimeString('es-MX', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit', hour12: false })}
                              </span>
                            )}
                          </div>
                        ) : !isCarrier ? (
                          <label className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 transition-colors cursor-pointer"
                                 title="Subir LAYOUT (Excel)">
                            <FileText size={18} />
                            <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
                                   onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadLayout(item.id!, item.numeroCaja, f); e.target.value = ''; }} />
                          </label>
                        ) : (
                          <span className="text-slate-300 italic">—</span>
                        )}
                      </td>
                      {/* CCP */}
                      <td className="py-3 px-4 text-center bg-sky-50/20 border-l border-sky-100/50">
                        {uploadingFor === item.id ? (
                          <Loader2 size={18} className="animate-spin text-sky-400 mx-auto" />
                        ) : item.ccpUrl ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <div className="flex items-center justify-center gap-1">
                              <a href={toDriveDownload(item.ccpUrl)} target="_blank" rel="noreferrer"
                                 className="inline-flex items-center justify-center p-1.5 rounded-lg text-blue-600 hover:bg-blue-100 transition-colors"
                                 title="Descargar CCP">
                                <FileText size={18} />
                              </a>
                              {!isCarrier && (
                                <label className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-100 transition-colors cursor-pointer"
                                       title="Reemplazar CCP">
                                  <UploadCloud size={16} />
                                  <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden"
                                         onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadCCP(item.id!, item.numeroCaja, f); e.target.value = ''; }} />
                                </label>
                              )}
                            </div>
                            {item.ccpUploadedAt && (
                              <span className="text-[10px] text-sky-500 font-mono whitespace-nowrap">
                                {new Date(item.ccpUploadedAt).toLocaleDateString('es-MX', { timeZone: 'America/Monterrey', day: '2-digit', month: '2-digit' })} {new Date(item.ccpUploadedAt).toLocaleTimeString('es-MX', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit', hour12: false })}
                              </span>
                            )}
                          </div>
                        ) : !isCarrier ? (
                          <label className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-300 hover:text-sky-500 hover:bg-sky-50 transition-colors cursor-pointer"
                                 title="Subir CCP">
                            <FileText size={18} />
                            <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden"
                                   onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadCCP(item.id!, item.numeroCaja, f); e.target.value = ''; }} />
                          </label>
                        ) : (
                          <span className="text-slate-300 italic">—</span>
                        )}
                      </td>
                      {/* ANEXO 29 */}
                      <td className="py-3 px-4 text-center bg-emerald-50/20 border-l border-emerald-100/50">
                        {uploadingFor === item.id ? (
                          <Loader2 size={18} className="animate-spin text-emerald-400 mx-auto" />
                        ) : item.anexo29Url ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <div className="flex items-center justify-center gap-1">
                              <a href={toDriveDownload(item.anexo29Url)} target="_blank" rel="noreferrer"
                                 className="inline-flex items-center justify-center p-1.5 rounded-lg text-blue-600 hover:bg-blue-100 transition-colors"
                                 title="Descargar Anexo29">
                                <FileText size={18} />
                              </a>
                              {!isCarrier && (
                                <label className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-100 transition-colors cursor-pointer"
                                       title="Reemplazar Anexo29">
                                  <UploadCloud size={16} />
                                  <input type="file" accept="application/pdf" className="hidden"
                                         onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadAnexo29(item.id!, item.numeroCaja, f); e.target.value = ''; }} />
                                </label>
                              )}
                            </div>
                            {item.anexo29UploadedAt && (
                              <span className="text-[10px] text-emerald-500 font-mono whitespace-nowrap">
                                {new Date(item.anexo29UploadedAt).toLocaleDateString('es-MX', { timeZone: 'America/Monterrey', day: '2-digit', month: '2-digit' })} {new Date(item.anexo29UploadedAt).toLocaleTimeString('es-MX', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit', hour12: false })}
                              </span>
                            )}
                          </div>
                        ) : !isCarrier ? (
                          <label className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 transition-colors cursor-pointer"
                                 title="Subir Anexo29 PDF">
                            <FileText size={18} />
                            <input type="file" accept="application/pdf" className="hidden"
                                   onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadAnexo29(item.id!, item.numeroCaja, f); e.target.value = ''; }} />
                          </label>
                        ) : (
                          <span className="text-slate-300 italic">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-500">
                        {item.asignadoA ? (
                          <div className="flex flex-col gap-0.5 items-start">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 border border-amber-300 rounded-full text-[10px] font-bold tracking-wide uppercase">
                              ASIGNADO
                            </span>
                            <span className="text-xs text-slate-500 flex items-center gap-1">
                              <UserCheck size={11} className="text-amber-500" /> {item.asignadoA}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-300 italic">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center border-l border-slate-100">
                        {item.cerrado ? (
                          <span className="inline-block px-2 py-1 bg-emerald-100 text-emerald-700 font-bold text-xs rounded tracking-wider">CERRADO</span>
                        ) : selectedIds.has(item.id!) ? (
                          <button
                            onClick={() => handleCierreRow(item.id!)}
                            className="px-3 py-1 bg-emerald-600 text-white rounded text-xs font-semibold hover:bg-emerald-700 shadow-sm transition-colors"
                          >
                            CIERRE
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            )}
          </div>
        </div>
      </div>

      <CatalogQueryBuilder 
        isOpen={queryBuilderOpen}
        onClose={() => setQueryBuilderOpen(false)}
        columns={['containerNo', 'sealNo', 'model', 'ref', 'productNo', 'vinNo', 'engineNo', 'color', 'orderNo', 'invoiceNo', 'shippingDate', 'plataformas']}
        conditions={queryConditions}
        setConditions={setQueryConditions}
        onApply={() => setQueryBuilderOpen(false)}
        onClear={() => {
          setQueryConditions([{ id: '1', column: 'containerNo', operator: 'in', type: 'string', input: '' }]);
          setQueryBuilderOpen(false);
        }}
      />
      
      {/* Modal de Reasignación */}
      {showReassignModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-scale-up border-t-4 border-amber-500">
            <h3 className="text-xl font-bold text-slate-800 mb-2 flex items-center gap-2">
              <span className="text-amber-500">⚠️</span> Registros ya asignados
            </h3>
            <p className="text-slate-600 mb-4 text-sm">
              Los siguientes registros ya tienen una asignación y no pueden ser reasignados automáticamente:
            </p>
            <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 mb-6 max-h-48 overflow-y-auto">
              <ul className="space-y-2 text-sm text-slate-700">
                {reassignConflicts.map(c => (
                  <li key={c.id} className="flex items-center justify-between border-b border-slate-100 pb-1 last:border-0 last:pb-0">
                    <span className="font-semibold text-slate-900">{c.numeroCaja}</span>
                    <span className="text-indigo-600 font-medium flex items-center gap-1">
                      <UserCheck size={12} /> {c.asignadoA}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowReassignModal(false);
                  setPendingForceIds([]);
                  setReassignConflicts([]);
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors"
              >
                {user?.role === UserRole.ADMIN ? 'Cancelar' : 'Entendido'}
              </button>
              
              {user?.role === UserRole.ADMIN && (
                <button
                  onClick={handleForceAssign}
                  disabled={isAssigning}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-bold transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {isAssigning ? <Loader2 size={16} className="animate-spin" /> : 'Forzar Reasignación'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
