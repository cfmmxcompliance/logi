import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Upload, Trash2, FileText, CheckCircle, AlertCircle, RefreshCw, Plus, Search, Filter, X, ChevronDown, Download, Database } from 'lucide-react';
import { storageService } from '../services/storageService.ts';
import { CommercialInvoiceItem } from '../types.ts';
import { xmlciService } from '../services/xmlciService.ts';
import { useNotification } from '../context/NotificationContext.tsx';

interface QueryCondition {
    id: string;
    column: string;
    operator: string;
    dataType: string;
    values: string;
}

export const XMLInvoiceExtractor: React.FC = () => {
    const { showNotification } = useNotification();
    const [items, setItems] = useState<CommercialInvoiceItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);

    // Filtering State
    const [searchTerm, setSearchTerm] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Tipo de Cambio State
    const [tcFecha, setTcFecha] = useState<string>(new Date().toISOString().split('T')[0]);
    const [tcValor, setTcValor] = useState<string | null>(null);
    const [tcValorNum, setTcValorNum] = useState<number>(0); // raw float for calculations
    const [tcLoading, setTcLoading] = useState(false);
    const [tcError, setTcError] = useState<string | null>(null);

    // Advanced Query Builder State
    const [isQueryBuilderOpen, setIsQueryBuilderOpen] = useState(false);
    const [queryConditions, setQueryConditions] = useState<QueryCondition[]>([
        { id: Date.now().toString(), column: 'partNo', operator: 'in list', dataType: 'String (Text)', values: '' }
    ]);
    const [appliedConditions, setAppliedConditions] = useState<QueryCondition[]>([]);
    const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);

    // Duplicate Detection State
    const [duplicateModal, setDuplicateModal] = useState<{
        duplicates: { uuid: string; invoiceNo: string; itemCount: number }[];
        resolve: (approved: string[]) => void;
    } | null>(null);
    const [approvedUUIDs, setApprovedUUIDs] = useState<Set<string>>(new Set());

    // VIN/MOTOR Conflict State
    const [vinMotorConflictModal, setVinMotorConflictModal] = useState<{
        conflicts: { vin?: string; engine?: string; invoiceNo: string; existingInvoiceNo: string }[];
    } | null>(null);

    // Selection State
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [columnWidths, setColumnWidths] = useState<Record<string, number>>({
        select: 40,
        acciones: 50,
        factura: 120,
        uuid: 100,
        fecha: 100,
        divisa: 60,
        parte: 120,
        unidad: 80,
        desc: 250,
        modelo: 120,
        vin: 170,
        motor: 130,
        pesoN: 100,
        pesoB: 100,
        valA: 100,
        cant: 80,
        unit: 100,
        total: 120
    });

    const resizingColumn = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

    const onMouseDown = (key: string, e: React.MouseEvent) => {
        const th = (e.currentTarget as HTMLElement).parentElement;
        if (!th) return;
        resizingColumn.current = {
            key,
            startX: e.pageX,
            startWidth: columnWidths[key] || th.offsetWidth
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        document.body.style.cursor = 'col-resize';
    };

    const onMouseMove = useCallback((e: MouseEvent) => {
        if (!resizingColumn.current) return;
        const { key, startX, startWidth } = resizingColumn.current;
        const newWidth = Math.max(40, startWidth + (e.pageX - startX));
        setColumnWidths(prev => ({ ...prev, [key]: newWidth }));
    }, []);

    const onMouseUp = useCallback(() => {
        resizingColumn.current = null;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = 'default';
    }, [onMouseMove]);

    // Fetch tipo de cambio — tries multiple CORS proxies with fallback
    const fetchTipoCambio = async (fecha: string) => {
        if (!fecha) return;
        setTcLoading(true);
        setTcError(null);
        setTcValor(null);

        const MONTH_ABBR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

        const parseHtml = (html: string, targetDay: number, targetAbbr: string, targetMonth: number): string | null => {
            const trMatches = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
            const getCells = (tr: string) =>
                (tr.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [])
                    .map(td => td.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').replace(/\s+/g, '').trim());

            // Find month column index
            let monthColIndex = -1;
            for (const tr of trMatches) {
                const texts = (tr.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [])
                    .map(td => td.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
                for (let ci = 0; ci < texts.length; ci++) {
                    if (texts[ci] === targetAbbr) { monthColIndex = ci; break; }
                }
                if (monthColIndex !== -1) break;
            }
            if (monthColIndex === -1) monthColIndex = targetMonth;

            // Find day row
            for (const tr of trMatches) {
                const cells = getCells(tr);
                if (cells.length < 2) continue;
                if (parseInt(cells[0], 10) === targetDay) {
                    const val = cells[monthColIndex] || '';
                    return /^\d+\.\d+$/.test(val) ? val : null;
                }
            }
            return null;
        };

        try {
            const [yearStr, monthStr, dayStr] = fecha.split('-');
            const targetDay = parseInt(dayStr, 10);
            const targetMonth = parseInt(monthStr, 10);
            const targetAbbr = MONTH_ABBR[targetMonth - 1];
            const sourceUrl = `https://aduanas-mexico.com.mx/indicadores_tc.php?year=${yearStr}`;

            // Proxy chain — tries each until one returns valid HTML
            const proxyChain: { name: string; fetch: () => Promise<string> }[] = [
                {
                    name: 'allorigins',
                    fetch: async () => {
                        const r = await fetch(
                            `https://api.allorigins.win/get?url=${encodeURIComponent(sourceUrl)}`,
                            { signal: AbortSignal.timeout(7000), cache: 'no-store' }
                        );
                        const j = await r.json();
                        return j.contents || '';
                    }
                },
                {
                    name: 'corsproxy.io',
                    fetch: async () => {
                        const r = await fetch(
                            `https://corsproxy.io/?${encodeURIComponent(sourceUrl)}`,
                            { signal: AbortSignal.timeout(7000), cache: 'no-store' }
                        );
                        return r.text();
                    }
                },
                {
                    name: 'cors.sh',
                    fetch: async () => {
                        const r = await fetch(sourceUrl, {
                            signal: AbortSignal.timeout(7000),
                            cache: 'no-store',
                            headers: { 'x-cors-api-key': 'temp_7aa1b24a-3e5d-4f8a-a7b1-c2e9d8f0123b' }
                        });
                        return r.text();
                    }
                },
                {
                    name: 'thingproxy',
                    fetch: async () => {
                        const r = await fetch(
                            `https://thingproxy.freeboard.io/fetch/${sourceUrl}`,
                            { signal: AbortSignal.timeout(7000), cache: 'no-store' }
                        );
                        return r.text();
                    }
                },
            ];

            let found: string | null = null;
            let lastErr = '';

            for (const proxy of proxyChain) {
                try {
                    const html = await proxy.fetch();
                    if (!html || html.length < 1000) { lastErr = `${proxy.name}: respuesta vacía`; continue; }
                    found = parseHtml(html, targetDay, targetAbbr, targetMonth);
                    if (found) break; // success
                    lastErr = `${proxy.name}: dato no encontrado`;
                } catch (e: any) {
                    lastErr = `${proxy.name}: ${e.message}`;
                    console.warn(`TC proxy ${proxy.name} failed:`, e.message);
                }
            }

            if (found) {
                const num = parseFloat(found);
                setTcValorNum(num);
                setTcValor(num.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 }));
            } else {
                setTcError('Sin publicar para esta fecha');
                console.warn('TC last error:', lastErr);
            }
        } catch (e) {
            console.error('Tipo de cambio fetch error:', e);
            setTcError('Error de conexión');
        } finally {
            setTcLoading(false);
        }
    };

    useEffect(() => {
        fetchTipoCambio(tcFecha);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const loadInitialData = async () => {
            setLoading(true);
            try {
                const refreshedInvoices = await storageService.refreshCFDIInvoices();
                setItems(refreshedInvoices);
            } catch (e) {
                console.error("Failed to fetch CFDI default", e);
            } finally {
                setLoading(false);
            }
        };
        loadInitialData();
    }, []);

    // Advanced Filtering Logic
    const filteredItems = useMemo(() => {
        return items.filter(item => {
            if (startDate && item.date < startDate) return false;
            if (endDate && item.date > endDate) return false;

            if (searchTerm.trim()) {
                const searchValues = searchTerm.split(',').map(v => v.trim().toLowerCase()).filter(v => v !== '');
                if (searchValues.length > 0) {
                    const searchableContent = [
                        item.invoiceNo,
                        item.partNo,
                        item.vin,
                        item.engine,
                        item.model,
                        item.rawDescripcion,
                        item.spanishDescription,
                        item.unidad,
                        item.uuid,
                        item.currency
                    ].map(v => (v || '').toString().toLowerCase());

                    const matchesSearch = searchValues.every(term =>
                        searchableContent.some(content => content.includes(term))
                    );
                    if (!matchesSearch) return false;
                }
            }

            if (appliedConditions.length > 0) {
                const matchesConditions = appliedConditions.every(condition => {
                    const columnValue = String((item as any)[condition.column] || '').toLowerCase();
                    const filterValues = condition.values.split(/[\n,]/).map(v => v.trim().toLowerCase()).filter(v => v !== '');

                    if (filterValues.length === 0) return true;

                    if (condition.operator === 'in list') {
                        return filterValues.some(val => columnValue.includes(val));
                    }
                    if (condition.operator === 'equals') {
                        return filterValues.some(val => columnValue === val);
                    }
                    if (condition.operator === 'contains') {
                        return filterValues.some(val => columnValue.includes(val));
                    }
                    return true;
                });
                if (!matchesConditions) return false;
            }

            return true;
        });
    }, [items, searchTerm, startDate, endDate, appliedConditions]);

    const parseNum = (val: any) => {
        if (typeof val === 'number') return val;
        if (!val) return 0;
        // Strip thousand-separator commas before matching (e.g. "3,952" → 3952)
        const match = String(val).replace(/,/g, '').match(/[\d.]+/);
        return match ? parseFloat(match[0]) : 0;
    };

    const totals = useMemo(() => {
        const modelos = new Set<string>();
        const partes = new Set<string>();
        const facturas = new Set<string>();
        const sums = filteredItems.reduce((acc, item: any) => {
            acc.qty += item.qty || 0;
            acc.total += item.totalAmount || 0;
            acc.pesoNeto += parseNum(item.pesoNetokg ?? item.pesoNeto);
            acc.pesoBruto += parseNum(item.pesoBrutokg ?? item.pesoBruto);
            acc.valAgregado += parseNum(item.valAgregado);
            if (item.model) modelos.add(String(item.model).trim());
            if (item.partNo) partes.add(String(item.partNo).trim());
            if (item.invoiceNo) facturas.add(String(item.invoiceNo).trim());
            return acc;
        }, { qty: 0, total: 0, pesoNeto: 0, pesoBruto: 0, valAgregado: 0 });
        return { ...sums, modelos: modelos.size, partes: partes.size, facturas: facturas.size };
    }, [filteredItems]);

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(new Set(filteredItems.map(i => i.id)));
        } else {
            setSelectedIds(new Set());
        }
    };

    const toggleSelection = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const addQueryCondition = () => {
        setQueryConditions([...queryConditions, { id: Date.now().toString(), column: 'partNo', operator: 'in list', dataType: 'String (Text)', values: '' }]);
    };

    const removeQueryCondition = (id: string) => {
        if (queryConditions.length > 1) {
            setQueryConditions(queryConditions.filter(c => c.id !== id));
        }
    };

    const updateQueryCondition = (id: string, updates: Partial<QueryCondition>) => {
        setQueryConditions(queryConditions.map(c => c.id === id ? { ...c, ...updates } : c));
    };

    const applyAdvancedQuery = () => {
        setAppliedConditions(queryConditions);
        setIsQueryBuilderOpen(false);
    };

    const resetQueryBuilder = () => {
        const initialCondition = { id: Date.now().toString(), column: 'partNo', operator: 'in list', dataType: 'String (Text)', values: '' };
        setQueryConditions([initialCondition]);
        setAppliedConditions([]);
    };

    const handleExportCSV = () => {
        const itemsToExport = items.filter(i => selectedIds.has(i.id));
        if (itemsToExport.length === 0) {
            showNotification('Error', 'Selecciona al menos un registro para exportar.', 'error');
            return;
        }

        try {
            const headers = [
                'INVOICE NO', 'UUID', 'DATE', 'CURRENCY', 'PART NO', 'UNIT', 'DESCRIPTION',
                'MODEL', 'VIN', 'ENGINE', 'NET WEIGHT', 'GROSS WEIGHT', 'VAL AGREGADO',
                'QTY', 'UNIT PRICE', 'TOTAL'
            ];

            const esc = (val: any) => {
                if (val === null || val === undefined) return '';
                const str = String(val).trim();
                if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            };

            const csvRows = itemsToExport.map((item, index) => {
                return [
                    esc(item.invoiceNo),
                    esc(item.uuid),
                    esc(item.date),
                    esc(item.currency),
                    esc(item.partNo),
                    esc(item.unidad || item.um),
                    esc(item.rawDescripcion || item.spanishDescription),
                    esc(item.model),
                    esc(item.vin),
                    esc(item.engine),
                    (item.pesoNetokg || (item as any).pesoNeto || 0).toFixed(4),
                    (item.pesoBrutokg || (item as any).pesoBruto || 0).toFixed(4),
                    (item.valAgregado || 0).toFixed(2),
                    (item.qty || 0).toFixed(4),
                    (item.unitPrice || 0).toFixed(4),
                    (item.totalAmount || 0).toFixed(2)
                ].join(',');
            });

            const csvContent = '\uFEFF' + headers.join(',') + '\n' + csvRows.join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');

            const rawSuffix = itemsToExport[0]?.invoiceNo || new Date().toISOString().slice(0, 10);
            const cleanSuffix = rawSuffix.replace(/[/\\?%*:|"<>]/g, '-');

            link.setAttribute('href', url);
            link.setAttribute('download', `XML_Export_${cleanSuffix}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showNotification('Éxito', `Exportación de ${itemsToExport.length} registros completada.`, 'success');
        } catch (error) {
            console.error("Manual Export Error:", error);
            showNotification('Error', "No se pudo generar el CSV.", 'error');
        }
    };

    // Returns list of UUIDs the user approved to overwrite
    const askAboutDuplicates = (dups: { uuid: string; invoiceNo: string; itemCount: number }[]): Promise<string[]> => {
        return new Promise((resolve) => {
            setApprovedUUIDs(new Set());
            setDuplicateModal({ duplicates: dups, resolve });
        });
    };

    // ── Word ML Fallback Parser ─────────────────────────────────────────────
    // Invoked ONLY when the standard cfdi:Comprobante parser finds nothing.
    // Handles XMLs where the CFDI is embedded as text inside <w:t> nodes
    // (Word ML 2003 format, progid="Word.Document").
    // Returns the same shape as parsedFiles entries so the rest of the pipeline
    // is completely unaffected.
    const parseWordMLCFDI = (
        text: string,
        parser: DOMParser,
        fileName: string
    ): { uuid: string; invoiceNo: string; fileItems: CommercialInvoiceItem[]; xmlDoc: Document } | null => {
        try {
            const wordDoc = parser.parseFromString(text, 'text/xml');
            const rootTag = wordDoc.documentElement?.tagName;
            if (rootTag !== 'w:wordDocument') return null;

            // Concatenate all <w:t> text nodes — the CFDI lives here as plain text
            const embedded = Array.from(wordDoc.getElementsByTagName('w:t'))
                .map((n: Element) => n.textContent || '').join('');
            if (!embedded.includes('cfdi:Comprobante')) return null;

            // Slice only the CFDI XML portion — the embedded string may start with
            // Word metadata text before the actual <cfdi:Comprobante> block.
            const cfdiStart = embedded.indexOf('<cfdi:Comprobante');
            const cfdiEnd   = embedded.lastIndexOf('</cfdi:Comprobante>');
            if (cfdiStart === -1 || cfdiEnd === -1) return null;
            const cfdiXml = embedded.substring(cfdiStart, cfdiEnd + '</cfdi:Comprobante>'.length);

            // Re-parse the extracted CFDI string as a proper XML document
            const cfdiDoc = parser.parseFromString(cfdiXml, 'text/xml');
            const comp  = cfdiDoc.getElementsByTagName('cfdi:Comprobante')[0] || cfdiDoc.getElementsByTagName('Comprobante')[0];
            const emis  = cfdiDoc.getElementsByTagName('cfdi:Emisor')[0]      || cfdiDoc.getElementsByTagName('Emisor')[0];
            const concs = cfdiDoc.getElementsByTagName('cfdi:Concepto');
            if (!comp || !emis || concs.length === 0) return null;

            const serie     = comp.getAttribute('Serie')  || '';
            const folio     = comp.getAttribute('Folio')  || '';
            const invoiceNo = (serie + folio).trim()      || 'S/F';
            const dateRaw   = comp.getAttribute('Fecha')  || new Date().toISOString();
            const date      = dateRaw.split('T')[0];
            const currency  = comp.getAttribute('Moneda') || 'USD';

            const timbre = cfdiDoc.getElementsByTagName('tfd:TimbreFiscalDigital')[0] || cfdiDoc.getElementsByTagName('TimbreFiscalDigital')[0];
            const uuid   = timbre?.getAttribute('UUID') || '';

            // Guard: UUID is required for deduplication — reject if missing
            if (!uuid) {
                console.warn(`[WordML fallback] ${fileName}: sin UUID fiscal (tfd:TimbreFiscalDigital ausente) — descartado`);
                return null;
            }

            const emisorRfc      = emis.getAttribute('Rfc')    || '';
            const emisorNombre   = emis.getAttribute('Nombre') || '';
            const emisorDomicilio = comp.getAttribute('LugarExpedicion') || 'MÉXICO';

            let extractedIncoterm = 'FCA';
            const cce = cfdiDoc.getElementsByTagName('cce11:ComercioExterior')[0] || cfdiDoc.getElementsByTagName('cce20:ComercioExterior')[0];
            if (cce) extractedIncoterm = cce.getAttribute('Incoterm') || 'FCA';

            const fileItems: CommercialInvoiceItem[] = [];
            for (let i = 0; i < concs.length; i++) {
                const c          = concs[i];
                const partNoRaw  = c.getAttribute('NoIdentificacion') || `ITEM-${i + 1}`;
                const descripcion = c.getAttribute('Descripcion')     || 'Sin descripción';
                const qty        = parseFloat(c.getAttribute('Cantidad')      || '1');
                const unitPrice  = parseFloat(c.getAttribute('ValorUnitario') || '0');
                const totalAmount = qty * unitPrice;

                const vinMatch        = descripcion.match(/VIN\s+([A-Z0-9]+)/i);
                const engineMatch     = descripcion.match(/ENGINE\s+([^/]+?)(?:\s*\/|\s*\)|\s*$)/i);
                const modelMatch      = descripcion.match(/MODELO\s+(.+?)(?:,|\s*$)/i);
                const netWeightMatch  = descripcion.match(/PESO NETO\s+([^/)]+)/i);
                const grossWeightMatch = descripcion.match(/PESO BRUTO\s+([^/)]+)/i);
                const addedValueMatch  = descripcion.match(/Val\.\s*Agregado\s+(.+)/i);

                const unidad          = c.getAttribute('Unidad') || '';
                const cleanDescription = descripcion.split(/[(]|VIN|MODELO|Val\./i)[0].trim();

                fileItems.push({
                    id:                (vinMatch ? vinMatch[1].trim() : '') || `${uuid}-${i}` || `${invoiceNo}-${partNoRaw}-${i}`,
                    invoiceNo, date,   item: String(i + 1),
                    model:             modelMatch   ? modelMatch[1].trim()      : 'N/A',
                    partNo:            partNoRaw,
                    spanishDescription: cleanDescription,
                    qty, unitPrice, totalAmount, currency,
                    vin:               vinMatch      ? vinMatch[1].trim()       : '',
                    engine:            engineMatch   ? engineMatch[1].trim()    : '',
                    pesoNetokg:        parseNum(netWeightMatch  ? netWeightMatch[1].trim()  : ''),
                    pesoBrutokg:       parseNum(grossWeightMatch ? grossWeightMatch[1].trim() : ''),
                    valAgregado:       parseNum(addedValueMatch  ? addedValueMatch[1].trim()  : ''),
                    unidad, rawDescripcion: descripcion, uuid,
                    vendorName: emisorNombre, vendorRfc: emisorRfc,
                    vendorAddress: emisorDomicilio, incoterm: extractedIncoterm
                } as any);
            }

            return { uuid, invoiceNo, fileItems, xmlDoc: cfdiDoc };
        } catch (e) {
            console.warn(`[WordML fallback] failed for ${fileName}:`, e);
            return null;
        }
    };
    // ─────────────────────────────────────────────────────────────────────────

    const processFiles = async (files: File[]) => {
        const xmlFiles = files.filter((f: File) => f.name.toLowerCase().endsWith('.xml'));

        if (xmlFiles.length === 0) {
            showNotification('Atención', 'No se encontraron archivos XML válidos.', 'warning');
            return;
        }

        setUploading(true);
        let count = 0;
        const newItems: CommercialInvoiceItem[] = [];

        // Build a map of existing UUIDs for fast duplicate lookup
        const existingUUIDs = new Set(items.map(i => (i as any).uuid).filter(Boolean));

        // Parse all files first, then check for duplicates
        const parsedFiles: { uuid: string; invoiceNo: string; fileItems: CommercialInvoiceItem[]; xmlDoc: Document }[] = [];

        for (const file of xmlFiles) {
            try {
                const text = await file.text();
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(text, "text/xml");

                const comprobante = xmlDoc.getElementsByTagName("cfdi:Comprobante")[0] || xmlDoc.getElementsByTagName("Comprobante")[0];
                const emisor = xmlDoc.getElementsByTagName("cfdi:Emisor")[0] || xmlDoc.getElementsByTagName("Emisor")[0];
                const conceptos = xmlDoc.getElementsByTagName("cfdi:Concepto");

                if (!comprobante || !emisor || !conceptos || conceptos.length === 0) {
                    // Standard CFDI parse failed — try Word ML fallback
                    const wordMLResult = parseWordMLCFDI(text, parser, file.name);
                    if (wordMLResult) {
                        parsedFiles.push(wordMLResult);
                    } else {
                        console.warn(`Archivo ${file.name} no parece un XML/CFDI válido.`);
                    }
                    continue;
                }

                const serie = comprobante.getAttribute("Serie") || comprobante.getAttribute("serie") || "";
                const folio = comprobante.getAttribute("Folio") || comprobante.getAttribute("folio") || "";
                const invoiceNo = (serie + folio).trim() || "S/F";

                const dateRaw = comprobante.getAttribute("Fecha") || comprobante.getAttribute("fecha") || new Date().toISOString();
                const date = dateRaw.split('T')[0];
                const currency = comprobante.getAttribute("Moneda") || "USD";

                const timbreFiscal = xmlDoc.getElementsByTagName("tfd:TimbreFiscalDigital")[0] || xmlDoc.getElementsByTagName("TimbreFiscalDigital")[0];
                const uuid = timbreFiscal?.getAttribute("UUID") || "";

                const emisorRfc = emisor.getAttribute("Rfc") || "";
                const emisorNombre = emisor.getAttribute("Nombre") || "";

                let emisorDomicilio = comprobante.getAttribute("LugarExpedicion") || "MÉXICO";
                const domFiscal = xmlDoc.getElementsByTagName("cfdi:DomicilioFiscal")[0];
                if (domFiscal) {
                    const calle = domFiscal.getAttribute("calle") || "";
                    const nExt = domFiscal.getAttribute("noExterior") || "";
                    const cp = domFiscal.getAttribute("codigoPostal") || "";
                    const mnpio = domFiscal.getAttribute("municipio") || "";
                    const edo = domFiscal.getAttribute("estado") || "";
                    emisorDomicilio = `${calle} ${nExt}, CP ${cp}, ${mnpio} ${edo}`.trim();
                }

                let extractedIncoterm = "FCA";
                const cce = xmlDoc.getElementsByTagName("cce11:ComercioExterior")[0] || xmlDoc.getElementsByTagName("cce20:ComercioExterior")[0];
                if (cce) {
                    extractedIncoterm = cce.getAttribute("Incoterm") || "FCA";
                }

                const fileItems: CommercialInvoiceItem[] = [];
                for (let i = 0; i < conceptos.length; i++) {
                    const concepto = conceptos[i];
                    const partNoRaw = concepto.getAttribute("NoIdentificacion") || `ITEM-${i + 1}`;
                    const descripcion = concepto.getAttribute("Descripcion") || "Sin descripción";
                    const qtyStr = concepto.getAttribute("Cantidad") || "1";
                    const unitPriceStr = concepto.getAttribute("ValorUnitario") || "0";
                    const qty = parseFloat(qtyStr);
                    const unitPrice = parseFloat(unitPriceStr);
                    const totalAmount = qty * unitPrice;

                    const vinMatch = descripcion.match(/VIN\s+([A-Z0-9]+)/i);
                    const engineMatch = descripcion.match(/ENGINE\s+([^/]+?)(?:\s*\/|\s*\)|\s*$)/i);
                    const modelMatch = descripcion.match(/MODELO\s+(.+?)(?:,|\s*$)/i);
                    const netWeightMatch = descripcion.match(/PESO NETO\s+([^/)]+)/i);
                    const grossWeightMatch = descripcion.match(/PESO BRUTO\s+([^/)]+)/i);
                    const addedValueMatch = descripcion.match(/Val\.\s*Agregado\s+(.+)/i);

                    const extractedVin = vinMatch ? vinMatch[1].trim() : "";
                    const extractedEngine = engineMatch ? engineMatch[1].trim() : "";
                    const extractedModel = modelMatch ? modelMatch[1].trim() : "N/A";
                    const extractedNetWeight = netWeightMatch ? netWeightMatch[1].trim() : "";
                    const extractedGrossWeight = grossWeightMatch ? grossWeightMatch[1].trim() : "";
                    const extractedAddedValue = addedValueMatch ? addedValueMatch[1].trim() : "";

                    const unidad = concepto.getAttribute("Unidad") || "";
                    const rawDescripcion = concepto.getAttribute("Descripcion") || "";
                    const cleanDescription = descripcion.split(/[(]|VIN|MODELO|Val\./i)[0].trim();

                    fileItems.push({
                        id: extractedVin || `${uuid}-${i}` || `${invoiceNo}-${partNoRaw}-${i}`,
                        invoiceNo, date, item: String(i + 1), model: extractedModel,
                        partNo: partNoRaw, spanishDescription: cleanDescription,
                        qty, unitPrice, totalAmount, currency,
                        vin: extractedVin, engine: extractedEngine,
                        pesoNetokg: parseNum(extractedNetWeight),
                        pesoBrutokg: parseNum(extractedGrossWeight),
                        valAgregado: parseNum(extractedAddedValue),
                        unidad, rawDescripcion, uuid,
                        vendorName: emisorNombre, vendorRfc: emisorRfc,
                        vendorAddress: emisorDomicilio, incoterm: extractedIncoterm
                    });
                }

                parsedFiles.push({ uuid, invoiceNo, fileItems, xmlDoc });
            } catch (err) {
                console.error(`Error procesando ${(file as any).name}:`, err);
            }
        }

        // --- DUPLICATE DETECTION ---
        const duplicates = parsedFiles
            .filter(f => f.uuid && existingUUIDs.has(f.uuid))
            .map(f => ({ uuid: f.uuid, invoiceNo: f.invoiceNo, itemCount: f.fileItems.length }));

        let approvedToOverwrite: string[] = [];
        if (duplicates.length > 0) {
            setUploading(false); // pause spinner while user decides
            approvedToOverwrite = await askAboutDuplicates(duplicates);
            setDuplicateModal(null);
            setUploading(true);
        }
        // --- VIN / MOTOR CONFLICT CHECK (for non-duplicate XMLs) ---
        // Build lookup maps from existing items
        const existingVINs = new Map<string, string>(); // vin -> invoiceNo
        const existingEngines = new Map<string, string>(); // engine -> invoiceNo
        items.forEach((it: any) => {
            if (it.vin && it.uuid && !existingUUIDs.has(it.uuid)) {
                existingVINs.set(String(it.vin).trim().toUpperCase(), it.invoiceNo || '');
            }
            if (it.engine && it.uuid && !existingUUIDs.has(it.uuid)) {
                existingEngines.set(String(it.engine).trim().toUpperCase(), it.invoiceNo || '');
            }
        });

        // Check new (non-UUID-duplicate) XMLs for VIN/MOTOR collisions
        const vinMotorConflicts: { vin?: string; engine?: string; invoiceNo: string; existingInvoiceNo: string }[] = [];
        const blockedUUIDs = new Set<string>(); // files that can't be uploaded due to VIN/MOTOR collision

        for (const parsed of parsedFiles) {
            const isDuplicate = parsed.uuid && existingUUIDs.has(parsed.uuid);
            if (isDuplicate) continue; // already handled above

            for (const fi of parsed.fileItems) {
                const vin = fi.vin ? String(fi.vin).trim().toUpperCase() : '';
                const engine = (fi as any).engine ? String((fi as any).engine).trim().toUpperCase() : '';

                if (vin && existingVINs.has(vin)) {
                    vinMotorConflicts.push({ vin: fi.vin, invoiceNo: parsed.invoiceNo, existingInvoiceNo: existingVINs.get(vin) || '?' });
                    blockedUUIDs.add(parsed.uuid);
                }
                if (engine && existingEngines.has(engine)) {
                    // Only add if not already listed for this parsed file
                    if (!vinMotorConflicts.some(c => c.engine === fi.engine && c.invoiceNo === parsed.invoiceNo)) {
                        vinMotorConflicts.push({ engine: (fi as any).engine, invoiceNo: parsed.invoiceNo, existingInvoiceNo: existingEngines.get(engine) || '?' });
                    }
                    blockedUUIDs.add(parsed.uuid);
                }
            }
        }

        if (vinMotorConflicts.length > 0) {
            setUploading(false);
            setVinMotorConflictModal({ conflicts: vinMotorConflicts });
            // Wait for user to close modal — no approval, just informational block
            await new Promise<void>(resolve => {
                const check = setInterval(() => {
                    // Resolved when modal state is cleared by the close button
                }, 200);
                // Store cleanup in a ref so close button can resolve it
                (window as any).__vinMotorConflictResolve = () => { clearInterval(check); resolve(); };
            });
            setVinMotorConflictModal(null);
            // If ALL files are blocked, abort
            const nonBlockedFiles = parsedFiles.filter(p => !blockedUUIDs.has(p.uuid) && !existingUUIDs.has(p.uuid));
            if (nonBlockedFiles.length === 0 && approvedToOverwrite.length === 0) {
                showNotification('Bloqueado', 'No se guardó ningún archivo debido a conflictos de VIN/Motor.', 'error');
                return;
            }
            setUploading(true);
        }

        for (const parsed of parsedFiles) {
            const isDuplicate = parsed.uuid && existingUUIDs.has(parsed.uuid);
            const isVinMotorBlocked = blockedUUIDs.has(parsed.uuid);
            if ((isDuplicate && !approvedToOverwrite.includes(parsed.uuid)) || isVinMotorBlocked) {
                // Skip: either a non-approved duplicate or a VIN/MOTOR conflict
                continue;
            }
            try {
                await xmlciService.extractAndSave(parsed.xmlDoc, parsed.invoiceNo,
                    parsed.fileItems[0]?.date || '', parsed.fileItems[0]?.currency || 'USD', parsed.uuid);
                newItems.push(...parsed.fileItems);
                count++;
            } catch (err) {
                console.error(`Error guardando ${parsed.invoiceNo}:`, err);
            }
        }

        if (count > 0) {
            try {
                const addedCount = await storageService.addCFDIInvoices(newItems);
                if (addedCount && addedCount > 0) {
                    showNotification('Extracción y Guardado Completo', `Se extrajeron y guardaron ${addedCount} registros únicos en la nueva tabla (cfdi_invoices).`, 'success');
                } else {
                    showNotification('Atención', `Se procesaron ${count} XMLs, pero los registros ya existían en la tabla (cfdi_invoices).`, 'warning');
                }
                setItems(prev => [...prev, ...newItems]);
            } catch (error) {
                console.error("Error auto-saving to Firebase CFDI", error);
                showNotification('Error', 'Se extrajeron los datos pero falló el guardado automático remoto.', 'error');
                setItems(prev => [...prev, ...newItems]);
            }
        } else if (duplicates.length > 0 && approvedToOverwrite.length === 0) {
            showNotification('Descartado', 'No se guardó ningún archivo (todos eran duplicados no aprobados).', 'warning');
        } else {
            showNotification('Error', 'No se pudo extraer información de los archivos seleccionados.', 'error');
        }
        setUploading(false);
    };

    const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files: File[] = Array.from(e.target.files || []);
        await processFiles(files);
        e.target.value = '';
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files: File[] = Array.from(e.target.files || []);
        await processFiles(files);
        e.target.value = '';
    };

    const handleDelete = async (id: string) => {
        try {
            await storageService.deleteCFDIInvoice(id);
            setItems(items.filter(item => item.id !== id));
            showNotification('Eliminado', 'Registro eliminado de Firebase (cfdi_invoices).', 'info');
        } catch (e) {
            showNotification('Error', 'No se pudo eliminar el registro de Firebase.', 'error');
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        try {
            const idsToDelete = Array.from(selectedIds) as string[];
            await storageService.deleteCFDIInvoices(idsToDelete);
            setItems(prev => prev.filter(item => !selectedIds.has(item.id)));
            setSelectedIds(new Set());
            setIsBulkDeleteModalOpen(false);
            showNotification('Éxito', `Se han eliminado ${selectedIds.size} registros.`, 'success');
        } catch (err) {
            console.error(err);
            showNotification('Error', 'No se pudieron eliminar los registros de Firebase.', 'error');
        }
    };

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 px-8 py-5 flex-shrink-0 flex flex-wrap items-center justify-between gap-4 z-10">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                        <FileText className="text-blue-600" size={28} />
                        XML Invoice Extractor (Targeted)
                    </h1>
                    <p className="text-slate-500 mt-1">Sube una carpeta XML para extraer facturas y guardarlas automáticamente en Firebase.</p>
                </div>

                {/* Tipo de Cambio Widget */}
                <div className="flex items-center gap-3 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl px-5 py-3 shadow-sm">
                    <div className="flex flex-col items-center justify-center w-10 h-10 bg-emerald-600 rounded-xl text-white flex-shrink-0">
                        <span className="text-[9px] font-bold leading-none">MXN</span>
                        <span className="text-[9px] font-bold leading-none opacity-70">/USD</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest">Tipo de Cambio DOF</span>
                        <div className="flex items-center gap-2 mt-0.5">
                            <input
                                type="date"
                                value={tcFecha}
                                onChange={e => { setTcFecha(e.target.value); fetchTipoCambio(e.target.value); }}
                                className="bg-white border border-emerald-200 rounded-lg px-2 py-1 text-xs text-slate-700 focus:ring-2 focus:ring-emerald-400 outline-none cursor-pointer"
                            />
                            {tcLoading && (
                                <span className="text-xs text-emerald-600 animate-pulse font-medium">Consultando...</span>
                            )}
                            {tcValor && !tcLoading && (
                                <span className="text-xl font-black text-emerald-700 font-mono tracking-tight">$ {tcValor}</span>
                            )}
                            {tcError && !tcLoading && (
                                <span className="text-xs text-red-500 font-medium">{tcError}</span>
                            )}
                            <button
                                onClick={() => fetchTipoCambio(tcFecha)}
                                title="Actualizar"
                                className="p-1 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-100 rounded-lg transition-colors"
                            >
                                <RefreshCw size={14} className={tcLoading ? 'animate-spin' : ''} />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {selectedIds.size > 0 && (
                        <>
                            <button
                                onClick={() => setIsBulkDeleteModalOpen(true)}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-all bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 animate-in fade-in slide-in-from-right-4"
                            >
                                <Trash2 size={20} />
                                <span>Eliminar Seleccionados ({selectedIds.size})</span>
                            </button>
                            <button
                                onClick={handleExportCSV}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-all bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20 shadow-lg animate-in fade-in slide-in-from-right-4"
                            >
                                <Download size={20} />
                                <span>Exportar Seleccionados (CSV) ({selectedIds.size})</span>
                            </button>
                        </>
                    )}

                    <label className={`
                        flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-all shadow-sm cursor-pointer
                        ${uploading ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 shadow-lg shadow-blue-500/5'}
                    `}>
                        {uploading ? <RefreshCw className="animate-spin" size={20} /> : <Plus size={20} />}
                        <span>{uploading ? 'Procesando...' : 'Cargar Archivos XML'}</span>
                        {!uploading && (
                            <input
                                type="file"
                                className="hidden"
                                multiple
                                accept=".xml"
                                onChange={handleFileUpload}
                                disabled={uploading}
                            />
                        )}
                    </label>

                    <label className={`
                        flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-all shadow-sm cursor-pointer
                        ${uploading ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20 shadow-lg'}
                    `}>
                        {uploading ? <RefreshCw className="animate-spin" size={20} /> : <Upload size={20} />}
                        <span>{uploading ? 'Procesando...' : 'Cargar Carpeta XML'}</span>
                        {!uploading && (
                            <input
                                type="file"
                                className="hidden"
                                webkitdirectory=""
                                directory=""
                                onChange={handleFolderUpload}
                                disabled={uploading}
                            />
                        )}
                    </label>
                </div>
            </header>

            {/* Toolbar */}
            <div className="bg-white border-b border-slate-200 px-8 py-4 flex items-center gap-6 justify-between flex-shrink-0">
                <div className="flex items-center gap-6 flex-1 max-w-5xl">
                    <div className="relative flex-1 group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                        <input
                            type="text"
                            placeholder="Buscar (Factura, Parte, VIN, Motor... sep. por comas)"
                            className="w-full pl-10 pr-4 py-2 bg-slate-100 border-none rounded-xl text-slate-700 focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 transition-colors"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>

                    <button
                        onClick={() => setIsQueryBuilderOpen(true)}
                        className={`flex items-center gap-2 px-4 py-2 border rounded-xl transition-all font-medium whitespace-nowrap ${appliedConditions.length > 0 ? 'bg-blue-50 border-blue-200 text-blue-600 shadow-sm' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                        <Filter size={18} />
                        Query Builder {appliedConditions.length > 0 && `(${appliedConditions.length})`}
                    </button>

                    <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
                        <div className="flex items-center gap-2 px-3 py-1">
                            <span className="text-xs font-bold text-slate-400 uppercase">Desde</span>
                            <input
                                type="date"
                                className="bg-transparent border-none text-sm text-slate-600 focus:ring-0 outline-none p-0 cursor-pointer"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                            />
                        </div>
                        <div className="w-px h-4 bg-slate-300"></div>
                        <div className="flex items-center gap-2 px-3 py-1">
                            <span className="text-xs font-bold text-slate-400 uppercase">Hasta</span>
                            <input
                                type="date"
                                className="bg-transparent border-none text-sm text-slate-600 focus:ring-0 outline-none p-0 cursor-pointer"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                            />
                        </div>
                        {(startDate || endDate) && (
                            <button
                                onClick={() => { setStartDate(''); setEndDate(''); }}
                                className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                </div>

                <div className="text-sm font-medium text-slate-500 flex items-center gap-2">
                    <span className="bg-slate-100 px-3 py-1 rounded-full">{filteredItems.length} registros</span>
                    {selectedIds.size > 0 && (
                        <span className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full border border-emerald-100 animate-in zoom-in-95">
                            {selectedIds.size} seleccionados
                        </span>
                    )}
                </div>
            </div>

            {/* Data Table */}
            <div className="flex-1 overflow-auto p-8 pt-6">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    <th className="sticky top-0 z-20 bg-slate-50 px-2 py-3 w-8 text-center border-b border-slate-200" style={{ width: columnWidths['select'] || 'auto' }}>
                                        <input
                                            type="checkbox"
                                            className="w-3 h-3 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                            checked={filteredItems.length > 0 && selectedIds.size === filteredItems.length}
                                            onChange={handleSelectAll}
                                        />
                                        <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 group-hover:bg-blue-300 transition-colors" onMouseDown={(e) => onMouseDown('select', e)} />
                                    </th>
                                    <th className="sticky top-0 z-20 bg-slate-50 px-2 py-3 font-bold text-[11px] text-slate-600 text-center border-b border-slate-200 uppercase tracking-wider group relative" style={{ width: columnWidths['acciones'] || 'auto' }}>
                                        Acciones
                                        <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => onMouseDown('acciones', e)} />
                                    </th>
                                    <th className="sticky top-0 z-20 bg-slate-50 px-2 py-3 font-bold text-[11px] text-slate-600 border-b border-slate-200 text-left uppercase tracking-wider group relative" style={{ width: columnWidths['factura'] || 'auto' }}>
                                        Factura
                                        <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => onMouseDown('factura', e)} />
                                    </th>
                                    <th className="sticky top-0 z-20 bg-slate-50 px-2 py-3 font-bold text-[11px] text-slate-600 border-b border-slate-200 text-left uppercase tracking-wider group relative" style={{ width: columnWidths['uuid'] || 'auto' }}>
                                        UUID
                                        <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => onMouseDown('uuid', e)} />
                                    </th>
                                    <th className="sticky top-0 z-20 bg-slate-50 px-2 py-3 font-bold text-[11px] text-slate-600 border-b border-slate-200 text-left uppercase tracking-wider group relative" style={{ width: columnWidths['fecha'] || 'auto' }}>
                                        Fecha
                                        <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => onMouseDown('fecha', e)} />
                                    </th>
                                    <th className="sticky top-0 z-20 bg-slate-50 px-2 py-3 font-bold text-[11px] text-slate-600 border-b border-slate-200 text-left uppercase tracking-wider group relative" style={{ width: columnWidths['divisa'] || 'auto' }}>
                                        Divisa
                                        <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => onMouseDown('divisa', e)} />
                                    </th>
                                    <th className="sticky top-0 z-20 bg-slate-50 px-2 py-3 font-bold text-[11px] text-slate-600 border-b border-slate-200 text-left uppercase tracking-wider group relative" style={{ width: columnWidths['parte'] || 'auto' }}>
                                        No. Parte
                                        <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => onMouseDown('parte', e)} />
                                    </th>
                                    <th className="sticky top-0 z-20 bg-slate-50 px-2 py-3 font-bold text-[11px] text-slate-600 border-b border-slate-200 text-left uppercase tracking-wider group relative" style={{ width: columnWidths['unidad'] || 'auto' }}>
                                        Unidad
                                        <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => onMouseDown('unidad', e)} />
                                    </th>
                                    <th className="sticky top-0 z-20 bg-slate-50 px-2 py-3 font-bold text-[11px] text-slate-600 border-b border-slate-200 text-left uppercase tracking-wider group relative" style={{ width: columnWidths['desc'] || 'auto' }}>
                                        Descripción
                                        <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => onMouseDown('desc', e)} />
                                    </th>
                                    <th className="sticky top-0 z-20 bg-slate-50 px-2 py-3 font-bold text-[11px] text-slate-600 border-b border-slate-200 text-left uppercase tracking-wider group relative" style={{ width: columnWidths['modelo'] || 'auto' }}>
                                        Modelo
                                        <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => onMouseDown('modelo', e)} />
                                    </th>
                                    <th className="sticky top-0 z-20 bg-slate-50 px-2 py-3 font-bold text-[11px] text-slate-600 border-b border-slate-200 text-left uppercase tracking-wider group relative" style={{ width: columnWidths['vin'] || 'auto' }}>
                                        VIN
                                        <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => onMouseDown('vin', e)} />
                                    </th>
                                    <th className="sticky top-0 z-20 bg-slate-50 px-2 py-3 font-bold text-[11px] text-slate-600 border-b border-slate-200 text-left uppercase tracking-wider group relative" style={{ width: columnWidths['motor'] || 'auto' }}>
                                        Motor
                                        <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => onMouseDown('motor', e)} />
                                    </th>
                                    <th className="sticky top-0 z-20 bg-slate-50 px-2 py-3 font-bold text-[11px] text-slate-600 border-b border-slate-200 text-right uppercase tracking-wider group relative" style={{ width: columnWidths['pesoN'] || 'auto' }}>
                                        Peso Neto
                                        <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => onMouseDown('pesoN', e)} />
                                    </th>
                                    <th className="sticky top-0 z-20 bg-slate-50 px-2 py-3 font-bold text-[11px] text-slate-600 border-b border-slate-200 text-right uppercase tracking-wider group relative" style={{ width: columnWidths['pesoB'] || 'auto' }}>
                                        Peso Bruto
                                        <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => onMouseDown('pesoB', e)} />
                                    </th>
                                    <th className="sticky top-0 z-20 bg-slate-50 px-2 py-3 font-bold text-[11px] text-slate-600 border-b border-slate-200 text-right uppercase tracking-wider group relative" style={{ width: columnWidths['valA'] || 'auto' }}>
                                        Valor Agr.
                                        <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => onMouseDown('valA', e)} />
                                    </th>
                                    <th className="sticky top-0 z-20 bg-slate-50 px-2 py-3 font-bold text-[11px] text-slate-600 border-b border-slate-200 text-right uppercase tracking-wider group relative" style={{ width: columnWidths['cant'] || 'auto' }}>
                                        Cant.
                                        <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => onMouseDown('cant', e)} />
                                    </th>
                                    <th className="sticky top-0 z-20 bg-slate-50 px-2 py-3 font-bold text-[11px] text-slate-600 border-b border-slate-200 text-right uppercase tracking-wider whitespace-nowrap group relative" style={{ width: columnWidths['unit'] || 'auto' }}>
                                        Precio Unit.
                                        <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => onMouseDown('unit', e)} />
                                    </th>
                                    <th className="sticky top-0 z-20 bg-slate-50 px-2 py-3 font-bold text-[11px] text-slate-600 border-b border-slate-200 text-right uppercase tracking-wider group relative" style={{ width: columnWidths['total'] || 'auto' }}>
                                        Total
                                        <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => onMouseDown('total', e)} />
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={18} className="p-20 text-center text-slate-400">
                                            <div className="flex flex-col items-center gap-3">
                                                <RefreshCw className="animate-spin" size={32} />
                                                <p>Sincronizando con Firebase...</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredItems.length > 0 ? (
                                    filteredItems.map((item: any) => (
                                        <tr key={item.id} className={`hover:bg-slate-50 transition-colors border-b border-slate-100 ${selectedIds.has(item.id) ? 'bg-blue-50/20' : ''}`}>
                                            <td className="px-2 py-2 text-center" style={{ width: columnWidths['select'] || 'auto' }}>
                                                <input
                                                    type="checkbox"
                                                    className="w-3 h-3 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                    checked={selectedIds.has(item.id)}
                                                    onChange={() => toggleSelection(item.id)}
                                                />
                                            </td>
                                            <td className="px-2 py-2 text-center" style={{ width: columnWidths['acciones'] || 'auto' }}>
                                                <button
                                                    onClick={() => handleDelete(item.id)}
                                                    className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </td>
                                            <td className="px-2 py-2 text-slate-700 font-medium whitespace-nowrap text-[11px]" style={{ width: columnWidths['factura'] || 'auto' }}>{item.invoiceNo}</td>
                                            <td className="px-2 py-2 text-slate-400 font-mono text-[9px] truncate" style={{ width: columnWidths['uuid'] || 'auto' }} title={item.uuid}>{item.uuid || '-'}</td>
                                            <td className="px-2 py-2 text-slate-500 whitespace-nowrap text-[11px]" style={{ width: columnWidths['fecha'] || 'auto' }}>{item.date}</td>
                                            <td className="px-2 py-2 text-slate-600 text-[11px]" style={{ width: columnWidths['divisa'] || 'auto' }}>{item.currency || 'USD'}</td>
                                            <td className="px-2 py-2 text-slate-700 font-mono text-[10px] whitespace-nowrap" style={{ width: columnWidths['parte'] || 'auto' }}>{item.partNo}</td>
                                            <td className="px-2 py-2 text-slate-500 text-[11px]" style={{ width: columnWidths['unidad'] || 'auto' }}>{item.unidad || 'N/A'}</td>
                                            <td className="px-2 py-2 text-slate-600 truncate text-[11px]" style={{ width: columnWidths['desc'] || 'auto' }} title={item.rawDescripcion}>{item.spanishDescription}</td>
                                            <td className="px-2 py-2 text-slate-600 truncate text-[11px]" style={{ width: columnWidths['modelo'] || 'auto' }} title={item.model}>{item.model}</td>
                                            <td className="px-2 py-2 text-slate-800 font-mono text-[10px] whitespace-nowrap" style={{ width: columnWidths['vin'] || 'auto' }}>{item.vin || 'N/A'}</td>
                                            <td className="px-2 py-2 text-slate-800 font-mono text-[10px] whitespace-nowrap" style={{ width: columnWidths['motor'] || 'auto' }}>{item.engine || 'N/A'}</td>
                                            <td className="px-2 py-2 text-slate-700 font-mono text-right whitespace-nowrap text-[11px]" style={{ width: columnWidths['pesoN'] || 'auto' }}>{parseNum(item.pesoNetokg ?? item.pesoNeto).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                            <td className="px-2 py-2 text-slate-700 font-mono text-right whitespace-nowrap text-[11px]" style={{ width: columnWidths['pesoB'] || 'auto' }}>{parseNum(item.pesoBrutokg ?? item.pesoBruto).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                            <td className="px-2 py-2 text-slate-700 font-mono text-right whitespace-nowrap text-[11px]" style={{ width: columnWidths['valA'] || 'auto' }}>{parseNum(item.valAgregado).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                            <td className="px-2 py-2 text-slate-700 font-mono text-right text-[11px]" style={{ width: columnWidths['cant'] || 'auto' }}>{item.qty}</td>
                                            <td className="px-2 py-2 text-slate-700 font-mono text-right text-[11px]" style={{ width: columnWidths['unit'] || 'auto' }}>${(item.unitPrice || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                            <td className="px-2 py-2 text-blue-700 font-bold font-mono text-right text-[11px]" style={{ width: columnWidths['total'] || 'auto' }}>${(item.totalAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={18} className="p-20 text-center text-slate-400">
                                            <div className="flex flex-col items-center gap-3">
                                                <FileText size={48} className="opacity-20" />
                                                <p>No hay datos disponibles en Firebase.</p>
                                                <p className="text-xs">Usa el botón superior para cargar archivos XML.</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Sticky Totals Footer */}
            <div className="bg-blue-600 px-6 py-2.5 flex-shrink-0 z-20 flex items-center justify-between text-white shadow-[0_-4px_20px_rgba(37,99,235,0.2)] overflow-x-auto gap-4 whitespace-nowrap">
                {/* Left: Counts */}
                <div className="flex items-center gap-5 flex-shrink-0">
                    <div className="flex flex-col items-start">
                        <span className="text-[9px] font-bold opacity-70 uppercase tracking-widest">Modelos</span>
                        <span className="text-xs font-mono font-bold leading-none">{(totals as any).modelos ?? 0}</span>
                    </div>
                    <div className="flex flex-col items-start">
                        <span className="text-[9px] font-bold opacity-70 uppercase tracking-widest">No. Parte</span>
                        <span className="text-xs font-mono font-bold leading-none">{(totals as any).partes ?? 0}</span>
                    </div>
                    <div className="flex flex-col items-start">
                        <span className="text-[9px] font-bold opacity-70 uppercase tracking-widest">Facturas</span>
                        <span className="text-xs font-mono font-bold leading-none">{(totals as any).facturas ?? 0}</span>
                    </div>
                </div>

                {/* Right: Totals — single row, no wrap */}
                <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="flex flex-col items-end">
                        <span className="text-[9px] font-bold opacity-70 uppercase tracking-widest">Peso Neto KG</span>
                        <span className="text-xs font-mono font-bold leading-none">{totals.pesoNeto.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-[9px] font-bold opacity-70 uppercase tracking-widest">Peso Bruto KG</span>
                        <span className="text-xs font-mono font-bold leading-none">{totals.pesoBruto.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-[9px] font-bold opacity-70 uppercase tracking-widest">Val. Agregado</span>
                        <span className="text-xs font-mono font-bold leading-none">{totals.valAgregado.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                    {/* ValAdMx */}
                    <div className="flex flex-col items-end bg-white/10 px-2 py-1 rounded-lg">
                        <span className="text-[9px] font-bold opacity-90 uppercase tracking-widest text-yellow-200">ValAdMx MXN</span>
                        <span className="text-xs font-mono font-bold leading-none text-yellow-100">
                            {tcValorNum > 0 ? `$${(totals.valAgregado * tcValorNum).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                        </span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-[9px] font-bold opacity-70 uppercase tracking-widest">Cantidad</span>
                        <span className="text-xs font-mono font-bold leading-none">{totals.qty.toLocaleString('en-US')}</span>
                    </div>
                    {/* ValUnit */}
                    <div className="flex flex-col items-end bg-white/10 px-2 py-1 rounded-lg">
                        <span className="text-[9px] font-bold opacity-90 uppercase tracking-widest text-cyan-200">ValUnit USD</span>
                        <span className="text-xs font-mono font-bold leading-none text-cyan-100">
                            {totals.qty > 0 ? `$${(totals.total / totals.qty).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                        </span>
                    </div>
                    {/* Monto Total */}
                    <div className="flex flex-col items-end border-l border-blue-400/50 pl-4 ml-1">
                        <span className="text-[9px] font-bold opacity-70 uppercase tracking-widest">Monto Total</span>
                        <span className="text-sm font-mono font-black leading-none">${totals.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    {/* ValTotMx */}
                    <div className="flex flex-col items-end bg-white/10 px-2 py-1 rounded-lg border border-yellow-400/30">
                        <span className="text-[9px] font-bold opacity-90 uppercase tracking-widest text-yellow-200">ValTotMx MXN</span>
                        <span className="text-sm font-mono font-black leading-none text-yellow-100">
                            {tcValorNum > 0 ? `$${(totals.total * tcValorNum).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                        </span>
                    </div>
                </div>
            </div>

            {/* VIN/MOTOR Conflict Modal (hard block - no overwrite option) */}
            {vinMotorConflictModal && (
                <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-red-600 px-6 py-5 flex items-center gap-4">
                            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                                <AlertCircle size={22} className="text-white" />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-white">Datos Duplicados Detectados</h3>
                                <p className="text-red-100 text-xs mt-0.5">El XML contiene VINs o Motores que ya existen en la Base de Datos. El archivo no será guardado.</p>
                            </div>
                        </div>
                        <div className="p-5 space-y-2 max-h-64 overflow-y-auto">
                            {vinMotorConflictModal.conflicts.map((c, i) => (
                                <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-red-50 border border-red-200">
                                    <X size={15} className="text-red-500 mt-0.5 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        {c.vin && <p className="font-bold text-slate-800 text-sm">VIN: <span className="font-mono">{c.vin}</span></p>}
                                        {c.engine && <p className="font-bold text-slate-800 text-sm">Motor: <span className="font-mono">{c.engine}</span></p>}
                                        <p className="text-slate-500 text-xs mt-0.5">Factura entrante: <span className="font-semibold">{c.invoiceNo}</span></p>
                                        <p className="text-red-500 text-xs">Ya existe en: <span className="font-semibold">{c.existingInvoiceNo}</span></p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="px-5 pb-5">
                            <button
                                onClick={() => {
                                    if ((window as any).__vinMotorConflictResolve) {
                                        (window as any).__vinMotorConflictResolve();
                                        delete (window as any).__vinMotorConflictResolve;
                                    }
                                    setVinMotorConflictModal(null);
                                }}
                                className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors text-sm"
                            >
                                Entendido — Descartar XML
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Duplicate Detection Modal */}
            {duplicateModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-amber-500 px-6 py-5 flex items-center gap-4">
                            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                                <AlertCircle size={22} className="text-white" />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-white">XMLs Duplicados Detectados</h3>
                                <p className="text-amber-100 text-xs mt-0.5">Los siguientes archivos ya existen en la Base de Datos. ¿Deseas sobreescribirlos?</p>
                            </div>
                        </div>
                        <div className="p-5 space-y-2 max-h-64 overflow-y-auto">
                            {duplicateModal.duplicates.map(dup => (
                                <div key={dup.uuid} className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                                    <AlertCircle size={15} className="text-amber-500 mt-0.5 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-slate-800 text-sm">{dup.invoiceNo}</p>
                                        <p className="text-slate-400 font-mono text-[10px] truncate">{dup.uuid}</p>
                                        <p className="text-slate-500 text-xs mt-0.5">{dup.itemCount} concepto(s)</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="px-5 pb-5 flex gap-3">
                            <button
                                onClick={() => duplicateModal.resolve([])}
                                className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors text-sm"
                            >
                                Cancelar (Descartar)
                            </button>
                            <button
                                onClick={() => duplicateModal.resolve(duplicateModal.duplicates.map(d => d.uuid))}
                                className="flex-1 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-colors shadow-lg shadow-amber-200 text-sm"
                            >
                                Aceptar (Sobreescribir)
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk Delete Modal */}
            {isBulkDeleteModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6">
                            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-red-600 mb-4">
                                <AlertCircle size={24} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-800 mb-2">¿Eliminar registros?</h3>
                            <p className="text-slate-600 mb-6">
                                Estás a punto de eliminar <span className="font-bold text-red-600">{selectedIds.size}</span> registros de forma permanente.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setIsBulkDeleteModalOpen(false)}
                                    className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleBulkDelete}
                                    className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl transition-colors shadow-lg shadow-red-500/20"
                                >
                                    Eliminar Ahora
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Advanced Query Builder Modal */}
            {isQueryBuilderOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-start bg-white">
                            <div className="flex gap-4">
                                <div className="bg-indigo-50 p-2.5 rounded-xl">
                                    <Database size={24} className="text-indigo-600" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-slate-800">Advanced Query Builder</h3>
                                    <p className="text-slate-500 text-sm mt-1">Combine multiple filters to find specific records in Master Data.</p>
                                </div>
                            </div>
                            <button onClick={() => setIsQueryBuilderOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                                <X size={20} className="text-slate-400" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-white">
                            {queryConditions.map((condition, index) => (
                                <div key={condition.id} className="flex gap-4 items-start animate-in slide-in-from-top-2 duration-300">
                                    <div className="flex-1 flex flex-col gap-3 bg-slate-50 p-6 rounded-2xl border border-slate-100 relative group">
                                        {/* Row 1: Column + Operator side by side */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Column</label>
                                                <select
                                                    value={condition.column}
                                                    onChange={(e) => updateQueryCondition(condition.id, { column: e.target.value })}
                                                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-700 shadow-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                                                >
                                                    <option value="partNo">No. Parte</option>
                                                    <option value="invoiceNo">Factura</option>
                                                    <option value="vin">VIN</option>
                                                    <option value="engine">Motor</option>
                                                    <option value="model">Modelo</option>
                                                    <option value="rawDescripcion">Descripción XML</option>
                                                    <option value="spanishDescription">Descripción ES</option>
                                                    <option value="uuid">UUID</option>
                                                </select>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Operator</label>
                                                <select
                                                    value={condition.operator}
                                                    onChange={(e) => updateQueryCondition(condition.id, { operator: e.target.value })}
                                                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-700 shadow-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                                                >
                                                    <option value="in list">In List (line separated)</option>
                                                    <option value="equals">Equals</option>
                                                    <option value="contains">Contains</option>
                                                </select>
                                            </div>
                                        </div>

                                        {/* Row 2: Values — full width spanning COLUMN + OPERATOR */}
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Values</label>
                                            <textarea
                                                value={condition.values}
                                                onChange={(e) => updateQueryCondition(condition.id, { values: e.target.value })}
                                                placeholder="Enter values..."
                                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-700 shadow-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all min-h-[80px] max-h-40 resize-y"
                                            />
                                        </div>

                                        {queryConditions.length > 1 && (
                                            <button
                                                onClick={() => removeQueryCondition(condition.id)}
                                                className="absolute -right-2 -top-2 w-7 h-7 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 hover:border-red-200 shadow-sm opacity-0 group-hover:opacity-100 transition-all"
                                            >
                                                <X size={14} />
                                            </button>
                                        )}
                                    </div>
                                    <div className="mt-11">
                                        <ChevronDown className="text-slate-300" size={24} />
                                    </div>
                                </div>
                            ))}

                            <button
                                onClick={addQueryCondition}
                                className="flex items-center gap-2 text-indigo-600 font-bold text-sm bg-indigo-50 px-4 py-2.5 rounded-xl hover:bg-indigo-100 transition-colors shadow-sm shadow-indigo-200/20 border border-indigo-100/50"
                            >
                                <Plus size={18} />
                                Add Condition
                            </button>
                        </div>

                        <div className="px-8 py-6 border-t border-slate-100 flex justify-between items-center bg-slate-50">
                            <button
                                onClick={resetQueryBuilder}
                                className="px-6 py-2.5 text-slate-500 font-bold hover:text-slate-700 transition-colors"
                            >
                                Reset All
                            </button>
                            <button
                                onClick={applyAdvancedQuery}
                                className="px-8 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all flex items-center gap-2"
                            >
                                Apply Query
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default XMLInvoiceExtractor;
