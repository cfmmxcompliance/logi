import React, { useState, useRef, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  Terminal, FileSpreadsheet, AlertTriangle,
  XCircle, Download, ChevronRight, Cpu, RefreshCw, Trash2,
  AlertCircle, FileSearch, Zap, BarChart3, BookOpen, CheckCircle2
} from 'lucide-react';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────
interface BomRow {
  ESTILO: string;
  INSUMO: string;
  CANTIDAD: number;
  MERMA: number;
  UNIDAD: string;
  BOM: string;
  FECHAINI: string | null;
  FECHAFIN: string | null;
}

interface TerminalLine {
  id: number;
  ts: string;
  type: 'info' | 'ok' | 'warn' | 'error' | 'cmd' | 'blank' | 'header';
  text: string;
}

interface ConflictItem {
  insumo: string;
  records: BomRow[];
  chosen: number | null;
}

interface AuditResult {
  noMaster: BomRow[];
  regimenA1: { insumo: string; regimen: string; desc: string }[];
  outliers: BomRow[];
  withHash: BomRow[];
  noDate: number;
}

// productNo → MODEL name
type ProductCatalog = Record<string, string>;

interface CatalogValidation {
  estilosValidos: { estilo: string; modelo: string; siblings: string[] }[];
  estilosInvalidos: string[];
  modelsWithoutBOM: { modelo: string; products: string[] }[];
}

type Step = 'idle' | 'loaded' | 'diagnosed' | 'normalized' | 'deduped' | 'crossed' | 'done';

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────
const TARGET_ESTILO = 'U24AMA1ETUSEE';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────
function ts() {
  return new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function avg(arr: number[]) { return arr.reduce((a, b) => a + b, 0) / (arr.length || 1); }
function std(arr: number[], mean: number) {
  return Math.sqrt(arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (arr.length || 1));
}

/** Extracts 2-digit model year from Product No. (e.g. U24AMA1ETUSEE → "24" → 2024) */
function extractModelYear(productNo: string): string | null {
  const m = productNo?.match(/^[A-Z](\d{2})/);
  return m ? `20${m[1]}` : null;
}

/** Year badge color class based on year string */
function yearColor(year: string | null): string {
  const colors: Record<string, string> = {
    '2023': 'bg-slate-700 text-slate-400 border-slate-600',
    '2024': 'bg-blue-900/50 text-blue-300 border-blue-700',
    '2025': 'bg-violet-900/50 text-violet-300 border-violet-700',
    '2026': 'bg-emerald-900/50 text-emerald-300 border-emerald-700',
  };
  return colors[year ?? ''] ?? 'bg-slate-800 text-slate-500 border-slate-700';
}

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────
export const BOMAnalyzer: React.FC = () => {
  // ── State ──────────────────────────────────────────────────────────────
  const [step, setStep]             = useState<Step>('idle');
  const [lines, setLines]           = useState<TerminalLine[]>([]);
  const [lineCounter, setLineCounter] = useState(0);
  const [rawRows, setRawRows]       = useState<BomRow[]>([]);
  const [normalizedRows, setNormalizedRows] = useState<BomRow[]>([]);
  const [dedupedRows, setDedupedRows] = useState<BomRow[]>([]);
  const [finalRows, setFinalRows]   = useState<BomRow[]>([]);
  const [conflicts, setConflicts]   = useState<ConflictItem[]>([]);
  const [masterMap, setMasterMap]   = useState<Record<string, any>>({});
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [productCatalog, setProductCatalog] = useState<ProductCatalog>({});
  const [catalogValidation, setCatalogValidation] = useState<CatalogValidation | null>(null);
  const [catalogFileName, setCatalogFileName] = useState('');
  const [catalogDragging, setCatalogDragging] = useState(false);
  const [dragging, setDragging]     = useState(false);
  const [masterDragging, setMasterDragging] = useState(false);
  const [fileName, setFileName]     = useState('');
  const [masterFileName, setMasterFileName] = useState('');
  const [diagStats, setDiagStats]   = useState<any>(null);
  const [activeTab, setActiveTab]   = useState<'terminal' | 'table' | 'audit'>('terminal');
  const [processing, setProcessing] = useState(false);

  const terminalRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const masterInputRef = useRef<HTMLInputElement>(null);
  const catalogInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [lines]);

  // ── Terminal helpers ───────────────────────────────────────────────────
  const addLine = useCallback((type: TerminalLine['type'], text: string) => {
    setLineCounter(c => {
      const id = c + 1;
      setLines(prev => [...prev, { id, ts: ts(), type, text }]);
      return id;
    });
  }, []);

  const addBlank = useCallback(() => addLine('blank', ''), [addLine]);

  const clearTerminal = () => {
    setLines([]);
    setLineCounter(0);
  };

  // ── Read Excel File ────────────────────────────────────────────────────
  const parseExcel = (file: File): Promise<BomRow[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const json: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: null });
          const rows: BomRow[] = json.map(r => ({
            ESTILO: String(r['ESTILO'] ?? '').trim(),
            INSUMO: String(r['INSUMO'] ?? '').trim(),
            CANTIDAD: Number(r['CANTIDAD'] ?? 0),
            MERMA: Number(r['MERMA'] ?? 0),
            UNIDAD: String(r['UNIDAD'] ?? 'PZA').trim(),
            BOM: String(r['BOM'] ?? '').trim(),
            FECHAINI: r['FECHAINI'] != null ? String(r['FECHAINI']) : null,
            FECHAFIN: r['FECHAFIN'] != null ? String(r['FECHAFIN']) : null,
          })).filter(r => r.INSUMO);
          resolve(rows);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  // ── Parse MasterData CSV ───────────────────────────────────────────────
  const parseMasterCSV = (file: File): Promise<Record<string, any>> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const lines = text.split('\n');
          const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
          const map: Record<string, any> = {};
          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map((c: string) => c.trim().replace(/^"|"$/g, ''));
            if (!cols[0]) continue;
            const obj: Record<string, string> = {};
            headers.forEach((h: string, idx: number) => { obj[h] = cols[idx] ?? ''; });
            map[cols[0]] = obj;
          }
          resolve(map);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsText(file, 'utf-8');
    });
  };

  // ── Step 1: Load BOM ───────────────────────────────────────────────────
  const handleBOMFile = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      addLine('error', `❌ Formato no soportado: ${file.name} — usa .xlsx o .xls`);
      return;
    }
    setProcessing(true);
    clearTerminal();
    addLine('header', '══════════════════════════════════════════════════');
    addLine('cmd', `> ANALIZADOR DE BOM v1.0 — LOGIMASTER`);
    addLine('header', '══════════════════════════════════════════════════');
    addBlank();
    addLine('cmd', `> [STEP 1] Cargando archivo: ${file.name}`);

    try {
      const rows = await parseExcel(file);
      setRawRows(rows);
      setFileName(file.name);

      const estilos = [...new Set(rows.map(r => r.ESTILO))];
      const insumos = [...new Set(rows.map(r => r.INSUMO))];

      addLine('ok', `✓ Archivo cargado exitosamente`);
      addLine('info', `  Registros totales  : ${rows.length}`);
      addLine('info', `  Insumos únicos     : ${insumos.length}`);
      addLine('info', `  Estilos detectados : ${estilos.length}`);
      addLine('info', `  Hoja               : Sheet1`);
      addLine('info', `  Columnas: ESTILO, INSUMO, CANTIDAD, MERMA, UNIDAD, BOM, FECHAINI, FECHAFIN`);
      addBlank();

      setStep('loaded');
    } catch (err) {
      addLine('error', `❌ Error al leer el archivo: ${String(err)}`);
    }
    setProcessing(false);
  };

  // ── Step 2: Diagnose ──────────────────────────────────────────────────
  const runDiagnosis = () => {
    addLine('cmd', `> [STEP 2] DIAGNÓSTICO DEL ARCHIVO`);
    addLine('header', '──────────────────────────────────────────────────');

    const estilos: string[] = Array.from(new Set(rawRows.map(r => r.ESTILO)));
    const estiloCount: Record<string, number> = {};
    rawRows.forEach(r => { estiloCount[r.ESTILO] = (estiloCount[r.ESTILO] || 0) + 1; });

    addLine('info', `Estilos únicos: ${estilos.length}`);
    estilos.forEach((e: string) => {
      const hasPoint = e.endsWith('.');
      const missingU = !e.startsWith('U');
      const isClean = !hasPoint && !missingU;
      const icon = isClean ? '  ✓' : '  ⚠';
      const note = hasPoint ? '— tiene punto final' : missingU ? '— falta prefijo "U"' : '— correcto';
      addLine(isClean ? 'ok' : 'warn', `${icon}  ${e}  →  ${estiloCount[e]} registros ${note}`);
    });
    addBlank();

    // Duplicates
    const comboCount: Record<string, number> = {};
    rawRows.forEach(r => {
      const k = `${r.ESTILO}||${r.INSUMO}`;
      comboCount[k] = (comboCount[k] || 0) + 1;
    });
    const dupCombos = Object.entries(comboCount).filter(([, v]) => v > 1);

    // Zero quantities
    const zeroQty = rawRows.filter(r => r.CANTIDAD === 0);
    // Empty dates
    const emptyDates = rawRows.filter(r => !r.FECHAINI && !r.FECHAFIN).length;
    // BOM values
    const bomVals = [...new Set(rawRows.map(r => r.BOM))];

    addLine('info', `Insumos únicos: ${new Set(rawRows.map(r => r.INSUMO)).size}`);
    addLine(dupCombos.length > 0 ? 'warn' : 'ok', `${dupCombos.length > 0 ? '⚠' : '✓'}  Combinaciones ESTILO+INSUMO duplicadas: ${dupCombos.length}`);
    addLine(zeroQty.length > 0 ? 'warn' : 'ok', `${zeroQty.length > 0 ? '⚠' : '✓'}  Registros con CANTIDAD = 0: ${zeroQty.length}`);
    addLine('warn', `⚠  FECHAINI/FECHAFIN vacías: ${emptyDates}/${rawRows.length}`);
    addLine('info', `   BOM identifier: ${bomVals.join(', ')}`);

    // Qty stats
    const qtys = rawRows.filter(r => r.CANTIDAD > 0).map(r => r.CANTIDAD);
    if (qtys.length > 0) {
      const mean = avg(qtys);
      const sigma = std(qtys, mean);
      const outliers = rawRows.filter(r => r.CANTIDAD > mean + 2 * sigma);
      addLine('info', `   CANTIDAD — min: ${Math.min(...qtys)} | max: ${Math.max(...qtys)} | avg: ${mean.toFixed(2)}`);
      addLine(outliers.length > 0 ? 'warn' : 'ok', `${outliers.length > 0 ? '⚠' : '✓'}  Outliers de cantidad (>avg+2σ=${(mean + 2 * sigma).toFixed(1)}): ${outliers.length}`);
    }
    addBlank();

    setDiagStats({ estilos, estiloCount, dupCombos: dupCombos.length, zeroQty: zeroQty.length, emptyDates });
    setStep('diagnosed');
    addLine('ok', `✓ Diagnóstico completado. Procede con la normalización.`);
    addBlank();
  };

  // ── Step 3: Normalize ─────────────────────────────────────────────────
  const runNormalization = () => {
    addLine('cmd', `> [STEP 3] NORMALIZACIÓN DE ESTILO → ${TARGET_ESTILO}`);
    addLine('header', '──────────────────────────────────────────────────');

    let changed = 0;
    const normalized = rawRows.map(r => {
      let estilo = r.ESTILO.trim().replace(/\.$/, '');
      if (!estilo.startsWith('U')) estilo = 'U' + estilo;
      if (estilo !== r.ESTILO) changed++;
      return { ...r, ESTILO: estilo };
    });

    setNormalizedRows(normalized);

    const estilosResult = [...new Set(normalized.map(r => r.ESTILO))];
    addLine('info', `  Registros procesados : ${normalized.length}`);
    addLine('ok',   `  ✓ Normalizados       : ${changed}`);
    addLine('info', `  Sin cambio           : ${normalized.length - changed}`);
    addLine('ok',   `  ✓ Estilos resultantes: ${estilosResult.join(', ')}`);
    addBlank();

    setStep('normalized');
    addLine('ok', `✓ Normalización completada. Procede con la deduplicación.`);
    addBlank();
  };

  // ── Step 4: Deduplicate ───────────────────────────────────────────────
  const runDeduplication = () => {
    addLine('cmd', `> [STEP 4] DEDUPLICACIÓN`);
    addLine('header', '──────────────────────────────────────────────────');

    const byInsumo: Record<string, BomRow[]> = {};
    normalizedRows.forEach(r => {
      if (!byInsumo[r.INSUMO]) byInsumo[r.INSUMO] = [];
      byInsumo[r.INSUMO].push(r);
    });

    const uniqueInsumos = Object.keys(byInsumo);
    const dups = uniqueInsumos.filter(k => byInsumo[k].length > 1);
    const clean = uniqueInsumos.filter(k => byInsumo[k].length === 1);

    // Group conflicts (different quantities)
    const conflicts2x: ConflictItem[] = [];
    const autoMerge: BomRow[] = [];

    dups.forEach(insumo => {
      const recs = byInsumo[insumo];
      const qtys = [...new Set(recs.map(r => r.CANTIDAD))];
      if (qtys.length === 1) {
        autoMerge.push(recs[0]); // same qty → keep first
      } else {
        conflicts2x.push({ insumo, records: recs, chosen: null });
      }
    });

    // Single records go straight through
    const singles: BomRow[] = clean.map(k => byInsumo[k][0]);

    addLine('info', `  Insumos únicos totales  : ${uniqueInsumos.length}`);
    addLine('ok',   `  ✓ Auto-deduplicados      : ${autoMerge.length + singles.length}`);
    addLine(conflicts2x.length > 0 ? 'warn' : 'ok',
            `  ${conflicts2x.length > 0 ? '⚠' : '✓'}  Conflictos de cantidad   : ${conflicts2x.length}`);
    addLine('info', `  Eliminados               : ${normalizedRows.length - uniqueInsumos.length}`);
    addBlank();

    setConflicts(conflicts2x);

    if (conflicts2x.length === 0) {
      const all = [...singles, ...autoMerge].sort((a, b) => a.INSUMO.localeCompare(b.INSUMO));
      setDedupedRows(all);
      setStep('deduped');
      addLine('ok', `✓ Deduplicación completa. ${all.length} insumos únicos.`);
    } else {
      // Partial — will complete after conflicts resolved
      const partial = [...singles, ...autoMerge];
      setDedupedRows(partial);
      setStep('deduped');
      addLine('warn', `⚠  Resuelve los ${conflicts2x.length} conflictos de cantidad en el panel inferior.`);
    }
    addBlank();
  };

  // ── Resolve a conflict ─────────────────────────────────────────────────
  const resolveConflict = (insumo: string, cantidad: number) => {
    setConflicts(prev => prev.map(c => c.insumo === insumo ? { ...c, chosen: cantidad } : c));
  };

  const applyConflictResolutions = () => {
    const unresolved = conflicts.filter(c => c.chosen === null);
    if (unresolved.length > 0) {
      addLine('error', `❌ Aún hay ${unresolved.length} conflictos sin resolver.`);
      return;
    }
    addLine('cmd', `> Aplicando resoluciones manuales...`);
    const resolved = conflicts.map(c => ({
      ...c.records[0],
      CANTIDAD: c.chosen!,
    }));
    const all = [...dedupedRows, ...resolved].sort((a, b) => a.INSUMO.localeCompare(b.INSUMO));
    setDedupedRows(all);
    setConflicts([]);
    addLine('ok', `✓ ${resolved.length} conflictos resueltos. Total: ${all.length} insumos únicos.`);
    addBlank();
  };

  // ── Step 5: Cross MasterData ───────────────────────────────────────────
  const handleMasterFile = async (file: File) => {
    if (!file.name.match(/\.(csv)$/i)) {
      addLine('error', `❌ Solo se acepta formato CSV para MasterData`);
      return;
    }
    setProcessing(true);
    addLine('cmd', `> [STEP 5] Cargando MasterData: ${file.name}`);
    try {
      const map = await parseMasterCSV(file);
      setMasterMap(map);
      setMasterFileName(file.name);
      addLine('ok', `✓ MasterData cargado: ${Object.keys(map).length} registros`);
      addBlank();
      runCrossMaster(map);
    } catch (err) {
      addLine('error', `❌ Error al leer MasterData: ${String(err)}`);
    }
    setProcessing(false);
  };

  const runCrossMaster = (map: Record<string, any>) => {
    addLine('cmd', `> CRUZANDO CON MASTERDATA...`);
    addLine('header', '──────────────────────────────────────────────────');

    const source = dedupedRows.length > 0 ? dedupedRows : normalizedRows;

    const noMaster: BomRow[] = [];
    const regimenA1: { insumo: string; regimen: string; desc: string }[] = [];
    const qtys = source.filter(r => r.CANTIDAD > 0).map(r => r.CANTIDAD);
    const mean = avg(qtys);
    const sigma = std(qtys, mean);
    const outliers: BomRow[] = [];
    const withHash: BomRow[] = [];

    source.forEach(r => {
      const m = map[r.INSUMO];
      if (!m) {
        noMaster.push(r);
      } else {
        if (m.REGIMEN && m.REGIMEN !== 'IN') {
          regimenA1.push({ insumo: r.INSUMO, regimen: m.REGIMEN, desc: m.DESCRIPTION_EN || '' });
        }
      }
      if (r.CANTIDAD > mean + 2 * sigma) outliers.push(r);
      if (r.INSUMO.includes('#')) withHash.push(r);
    });

    const noDate = source.filter(r => !r.FECHAINI && !r.FECHAFIN).length;

    addLine('info', `  Total insumos analizados : ${source.length}`);
    addLine(noMaster.length > 0 ? 'error' : 'ok',
      `  ${noMaster.length > 0 ? '❌' : '✓'}  Sin registro en MasterData: ${noMaster.length}`);
    addLine(regimenA1.length > 0 ? 'warn' : 'ok',
      `  ${regimenA1.length > 0 ? '⚠' : '✓'}  Régimen ≠ IN (empaque A1) : ${regimenA1.length}`);
    addLine(outliers.length > 0 ? 'warn' : 'ok',
      `  ${outliers.length > 0 ? '⚠' : '✓'}  Outliers de cantidad       : ${outliers.length}`);
    addLine(withHash.length > 0 ? 'warn' : 'ok',
      `  ${withHash.length > 0 ? '⚠' : '✓'}  Part# con "#" (comodín)    : ${withHash.length}`);
    addLine('warn', `  ⚠  FECHAINI/FECHAFIN vacías  : ${noDate}/${source.length}`);
    addBlank();

    const audit: AuditResult = { noMaster, regimenA1, outliers, withHash, noDate };
    setAuditResult(audit);
    setFinalRows(source);
    setStep('crossed');

    addLine('ok', `✓ Cruce con MasterData completado.`);
    addLine('info', `  Accede al tab "Auditoría" para ver el detalle completo.`);
    addBlank();
    setActiveTab('audit');
  };

  // ── Parse Productos catalog Excel ──────────────────────────────────
  const parseCatalogExcel = (file: File): Promise<ProductCatalog> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const json: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: null });
          const catalog: ProductCatalog = {};
          // Find whichever row has MODEL / Product No. as first real header
          for (const row of json) {
            const vals = Object.values(row).map(v => String(v ?? '').trim());
            // Skip the header row itself
            if (vals[0] === 'MODEL' || vals[0] === 'model') continue;
            const keys = Object.keys(row);
            const modelVal = String(row[keys[0]] ?? '').trim();
            const productVal = String(row[keys[1]] ?? '').trim();
            if (modelVal && productVal && !['MODEL','model'].includes(modelVal)) {
              catalog[productVal] = modelVal;
            }
          }
          resolve(catalog);
        } catch (err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const handleCatalogFile = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      addLine('error', `❌ Catálogo requiere formato .xlsx`);
      return;
    }
    setProcessing(true);
    addLine('cmd', `> [CATÁLOGO] Cargando: ${file.name}`);
    try {
      const catalog = await parseCatalogExcel(file);
      setProductCatalog(catalog);
      setCatalogFileName(file.name);

      const models = Array.from(new Set(Object.values(catalog)));
      addLine('ok',   `✓ Catálogo cargado: ${Object.keys(catalog).length} productos | ${models.length} modelos`);

      // Run validation against current BOM rows
      const source = finalRows.length > 0 ? finalRows : dedupedRows.length > 0 ? dedupedRows : normalizedRows;
      if (source.length > 0) {
        runCatalogValidation(catalog, source);
      } else {
        addLine('warn', `⚠  Carga y procesa el BOM primero para ver la validación de estilos.`);
      }
    } catch (err) {
      addLine('error', `❌ Error al leer catálogo: ${String(err)}`);
    }
    setProcessing(false);
  };

  const runCatalogValidation = (catalog: ProductCatalog, source: BomRow[]) => {
    addLine('header', '──────────────────────────────────────────────────');
    addLine('cmd', `> VALIDACIÓN ESTILO vs CATÁLOGO DE PRODUCTOS`);

    const bomEstilos = Array.from(new Set(source.map(r => r.ESTILO)));

    // Detect model year from BOM estilos
    const bomYears = Array.from(new Set(bomEstilos.map(extractModelYear).filter(Boolean))) as string[];
    if (bomYears.length > 0) {
      addLine('info', `  Año(s) modelo detectado en BOM : ${bomYears.join(', ')}`);
    }

    // Group catalog by model
    const byModel: Record<string, string[]> = {};
    for (const [productNo, model] of Object.entries(catalog)) {
      if (!byModel[model]) byModel[model] = [];
      byModel[model].push(productNo);
    }

    const estilosValidos: CatalogValidation['estilosValidos'] = [];
    const estilosInvalidos: string[] = [];

    for (const estilo of bomEstilos) {
      const modelo = catalog[estilo];
      if (modelo) {
        const siblings = byModel[modelo].filter(p => p !== estilo);
        estilosValidos.push({ estilo, modelo, siblings });
        addLine('ok',  `  ✓ ${estilo}  →  ${modelo}  (${siblings.length} hermanos en catálogo)`);
      } else {
        estilosInvalidos.push(estilo);
        addLine('warn', `  ⚠  ${estilo}  →  No encontrado en catálogo`);
      }
    }

    // Models that have products NOT present as BOM estilos
    const bomEstiloSet = new Set(bomEstilos);
    const modelsWithoutBOM: CatalogValidation['modelsWithoutBOM'] = [];
    for (const [modelo, products] of Object.entries(byModel)) {
      const missing = products.filter(p => !bomEstiloSet.has(p));
      if (missing.length > 0) {
        modelsWithoutBOM.push({ modelo, products: missing });
      }
    }

    addBlank();
    addLine('info', `  Estilos válidos en catálogo : ${estilosValidos.length}/${bomEstilos.length}`);
    addLine(estilosInvalidos.length > 0 ? 'warn' : 'ok',
      `  ${estilosInvalidos.length > 0 ? '⚠' : '✓'}  Estilos NO en catálogo   : ${estilosInvalidos.length}`);
    addLine('info', `  Modelos con products sin BOM: ${modelsWithoutBOM.length}`);
    const totalSinBOM = modelsWithoutBOM.reduce((a, m) => a + m.products.length, 0);
    addLine('warn', `  ⚠  Products sin BOM asignado : ${totalSinBOM}`);
    addBlank();
    addLine('ok', `✓ Validación de catálogo completa. Ver tab Auditoría → Catálogo.`);

    setCatalogValidation({ estilosValidos, estilosInvalidos, modelsWithoutBOM });
    setActiveTab('audit');
  };

  // ── Drop handlers ─────────────────────────────────────────────────
  const onDrop = useCallback((e: React.DragEvent, target: 'bom' | 'master' | 'catalog' = 'bom') => {
    e.preventDefault();
    if (target === 'master') setMasterDragging(false);
    else if (target === 'catalog') setCatalogDragging(false);
    else setDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (target === 'master') handleMasterFile(file);
    else if (target === 'catalog') handleCatalogFile(file);
    else handleBOMFile(file);
  }, [rawRows, normalizedRows, dedupedRows, finalRows, productCatalog]); // eslint-disable-line

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); };

  // ── Export final BOM ──────────────────────────────────────────────────
  const exportFinalBOM = () => {
    const source = finalRows.length > 0 ? finalRows : dedupedRows;
    const wsData = [
      ['ESTILO', 'INSUMO', 'CANTIDAD', 'MERMA', 'UNIDAD', 'BOM', 'FECHAINI', 'FECHAFIN'],
      ...source.map(r => [r.ESTILO, r.INSUMO, r.CANTIDAD, r.MERMA, r.UNIDAD, r.BOM, r.FECHAINI ?? '', r.FECHAFIN ?? ''])
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BOM_Normalizado');
    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `BOM_Final_${date}.xlsx`);
    addLine('ok', `✓ BOM exportado: BOM_Final_${date}.xlsx (${source.length} registros)`);
  };

  // ── Export missing master report ──────────────────────────────────────
  const exportMissingMaster = () => {
    if (!auditResult) return;
    const wsData = [
      ['#', 'INSUMO', 'CANTIDAD', 'MERMA', 'UNIDAD', 'BOM', 'DESCRIPTION_EN', 'DESCRIPCION_ES', 'HTSMX', 'REGIMEN', 'NOTA'],
      ...auditResult.noMaster.map((r, i) => {
        let nota = 'Sin alta en MasterData';
        if (r.CANTIDAD === 0) nota = 'Cantidad 0 — variante inactiva';
        else if (r.INSUMO.includes('#')) nota = 'Part# comodín';
        else if (/-(0BP|0BB|0YG|0RE|0ET|0YD)/.test(r.INSUMO)) nota = 'Variante de color/acabado';
        return [i + 1, r.INSUMO, r.CANTIDAD, r.MERMA, r.UNIDAD, r.BOM, '', '', '', '', nota];
      })
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sin_MasterData');
    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `BOM_Sin_MasterData_${date}.xlsx`);
    addLine('ok', `✓ Reporte exportado: BOM_Sin_MasterData_${date}.xlsx (${auditResult.noMaster.length} registros)`);
  };


  // ── Terminal line renderer ────────────────────────────────────────────
  const lineColor: Record<TerminalLine['type'], string> = {
    cmd:    'text-cyan-400',
    ok:     'text-emerald-400',
    warn:   'text-yellow-400',
    error:  'text-red-400',
    info:   'text-slate-300',
    blank:  'text-transparent',
    header: 'text-blue-400',
  };

  // ── Render ─────────────────────────────────────────────────────────────
  const tableSource = finalRows.length > 0 ? finalRows : dedupedRows.length > 0 ? dedupedRows : normalizedRows;
  const unresolvedCount = conflicts.filter(c => c.chosen === null).length;
  const allConflictsResolved = conflicts.length > 0 && unresolvedCount === 0;

  return (
    <div className="flex flex-col h-full gap-0 -m-8 bg-slate-950">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-3 bg-slate-900 border-b border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Cpu size={18} className="text-white" />
          </div>
          <div>
            <h1 className="font-bold text-white text-sm tracking-wider">BOM ANALYZER</h1>
            <p className="text-slate-500 text-[10px] tracking-widest">LOGIMASTER · ANALYSIS ENGINE</p>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest">
          {(['loaded', 'diagnosed', 'normalized', 'deduped', 'crossed', 'done'] as Step[]).map((s, i) => {
            const labels = ['Upload', 'Diagnose', 'Normalize', 'Dedupe', 'MasterData', 'Done'];
            const stepOrder: Step[] = ['idle', 'loaded', 'diagnosed', 'normalized', 'deduped', 'crossed', 'done'];
            const currentIdx = stepOrder.indexOf(step);
            const thisIdx = stepOrder.indexOf(s);
            const isDone = currentIdx > thisIdx;
            const isActive = currentIdx === thisIdx;
            return (
              <React.Fragment key={s}>
                {i > 0 && <ChevronRight size={10} className="text-slate-700" />}
                <span className={`px-2 py-1 rounded ${isDone ? 'bg-emerald-900/50 text-emerald-400' : isActive ? 'bg-blue-900/50 text-blue-400' : 'text-slate-600'}`}>
                  {isDone ? '✓' : `${i + 1}.`} {labels[i]}
                </span>
              </React.Fragment>
            );
          })}
        </div>

        <button onClick={clearTerminal} className="text-slate-600 hover:text-slate-400 transition-colors" title="Limpiar terminal">
          <Trash2 size={16} />
        </button>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0">

        {/* ── Left Panel: Controls ── */}
        <div className="w-72 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col p-4 gap-3 overflow-y-auto">

          {/* Upload BOM */}
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">1 · Cargar BOM Excel</p>
            <div
              className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all
                ${dragging ? 'border-blue-500 bg-blue-900/20' : 'border-slate-700 hover:border-blue-700 hover:bg-slate-800/50'}`}
              onDrop={e => onDrop(e, false)}
              onDragOver={onDragOver}
              onDragEnter={() => setDragging(true)}
              onDragLeave={() => setDragging(false)}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" className="hidden" accept=".xlsx,.xls"
                onChange={e => { if (e.target.files?.[0]) handleBOMFile(e.target.files[0]); e.target.value = ''; }} />
              <FileSpreadsheet size={28} className={`mx-auto mb-2 ${fileName ? 'text-emerald-400' : 'text-slate-600'}`} />
              {fileName
                ? <p className="text-[11px] text-emerald-400 font-bold truncate">{fileName}</p>
                : <p className="text-[11px] text-slate-500">Drop .xlsx o click</p>}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">2 · Análisis</p>
            {[
              { label: 'Diagnóstico', icon: FileSearch, fn: runDiagnosis, disabled: step !== 'loaded', active: step === 'loaded' },
              { label: 'Normalizar ESTILO', icon: Zap, fn: runNormalization, disabled: step !== 'diagnosed', active: step === 'diagnosed' },
              { label: 'Deduplicar', icon: RefreshCw, fn: runDeduplication, disabled: step !== 'normalized', active: step === 'normalized' },
            ].map(({ label, icon: Icon, fn, disabled, active }) => (
              <button key={label} onClick={fn} disabled={disabled}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-bold transition-all
                  ${disabled ? 'text-slate-700 cursor-not-allowed' : active
                    ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-500/20'
                    : 'bg-emerald-900/40 text-emerald-400 hover:bg-emerald-900/60 border border-emerald-900'}`}>
                <Icon size={14} />
                {label}
                {active && <span className="ml-auto animate-pulse text-blue-300">●</span>}
              </button>
            ))}
          </div>

          {/* Conflict resolution */}
          {conflicts.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-yellow-500 uppercase tracking-widest flex items-center gap-1">
                <AlertTriangle size={10} /> {unresolvedCount} conflictos pendientes
              </p>
              {conflicts.map(c => {
                const m = masterMap[c.insumo];
                const noMasterLoaded = Object.keys(masterMap).length === 0;
                const descEn = m?.DESCRIPTION_EN || '';
                const descEs = m?.DESCRIPCION_ES || '';
                const desc = descEn || descEs;
                const descLabel = noMasterLoaded
                  ? <span className="text-slate-600 italic">Sin MasterData cargado</span>
                  : !m
                    ? <span className="text-red-400 italic">⚠ No en MasterData</span>
                    : desc
                      ? <span className="text-slate-400 italic truncate max-w-[120px]" title={desc}>{desc}</span>
                      : <span className="text-slate-600 italic">Sin descripción</span>;
                return (
                  <div key={c.insumo} className="bg-slate-800 rounded-lg p-3 border border-yellow-900/50">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-[10px] text-yellow-400 font-mono font-bold shrink-0">{c.insumo}</p>
                      {descLabel && (
                        <p className="text-[10px] text-right shrink-0">
                          {descLabel}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {([...new Set(c.records.map(r => r.CANTIDAD))] as number[]).map((qty: number) => (
                        <button key={qty} onClick={() => resolveConflict(c.insumo, qty)}
                          className={`px-2 py-1 rounded text-[11px] font-bold transition-all
                            ${c.chosen === qty ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                          {qty}
                        </button>
                      ))}
                    </div>
                    {c.chosen !== null && <p className="text-[10px] text-emerald-400 mt-1">✓ Seleccionado: {c.chosen}</p>}
                  </div>
                );
              })}
              {allConflictsResolved && (
                <button onClick={applyConflictResolutions}
                  className="w-full py-2 bg-emerald-600 text-white text-[11px] font-bold rounded-lg hover:bg-emerald-500 transition-all">
                  Aplicar resoluciones ✓
                </button>
              )}
            </div>
          )}

          {/* MasterData Upload */}
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">3 · MasterData CSV</p>
            <div
              className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all
                ${step !== 'deduped' || conflicts.length > 0 ? 'opacity-40 pointer-events-none' : ''}
                ${masterDragging ? 'border-purple-500 bg-purple-900/20' : 'border-slate-700 hover:border-purple-700 hover:bg-slate-800/50'}`}
              onDrop={e => onDrop(e, 'master')}
              onDragOver={onDragOver}
              onDragEnter={() => setMasterDragging(true)}
              onDragLeave={() => setMasterDragging(false)}
              onClick={() => masterInputRef.current?.click()}
            >
              <input ref={masterInputRef} type="file" className="hidden" accept=".csv"
                onChange={e => { if (e.target.files?.[0]) handleMasterFile(e.target.files[0]); e.target.value = ''; }} />
              <BarChart3 size={28} className={`mx-auto mb-2 ${masterFileName ? 'text-purple-400' : 'text-slate-600'}`} />
              {masterFileName
                ? <p className="text-[11px] text-purple-400 font-bold truncate">{masterFileName}</p>
                : <p className="text-[11px] text-slate-500">Drop MasterData .csv</p>}
            </div>
          </div>

          {/* Productos Catalog Upload */}
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">4 · Catálogo Productos</p>
            <div
              className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all
                ${step === 'idle' ? 'opacity-40 pointer-events-none' : ''}
                ${catalogDragging ? 'border-teal-500 bg-teal-900/20' : 'border-slate-700 hover:border-teal-700 hover:bg-slate-800/50'}`}
              onDrop={e => onDrop(e, 'catalog')}
              onDragOver={onDragOver}
              onDragEnter={() => setCatalogDragging(true)}
              onDragLeave={() => setCatalogDragging(false)}
              onClick={() => catalogInputRef.current?.click()}
            >
              <input ref={catalogInputRef} type="file" className="hidden" accept=".xlsx,.xls"
                onChange={e => { if (e.target.files?.[0]) handleCatalogFile(e.target.files[0]); e.target.value = ''; }} />
              <BookOpen size={28} className={`mx-auto mb-2 ${catalogFileName ? 'text-teal-400' : 'text-slate-600'}`} />
              {catalogFileName
                ? <p className="text-[11px] text-teal-400 font-bold truncate">{catalogFileName}</p>
                : <p className="text-[11px] text-slate-500">Drop Productos .xlsx</p>}
              {catalogFileName && (
                <p className="text-[10px] text-slate-600 mt-1">{Object.keys(productCatalog).length} products · {Array.from(new Set(Object.values(productCatalog))).length} modelos</p>
              )}
            </div>
          </div>

          {/* Exports */}
          {(step === 'deduped' || step === 'crossed' || step === 'done') && (
            <div className="space-y-1 pt-2 border-t border-slate-800">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">5 · Exportar</p>
              <button onClick={exportFinalBOM}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-bold bg-emerald-700/30 text-emerald-400 hover:bg-emerald-700/50 border border-emerald-900 transition-all">
                <Download size={14} /> BOM Final (.xlsx)
              </button>
              {auditResult && (
                <button onClick={exportMissingMaster}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-bold bg-orange-700/20 text-orange-400 hover:bg-orange-700/40 border border-orange-900 transition-all">
                  <Download size={14} /> Sin MasterData ({auditResult.noMaster.length})
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Right Panel: Terminal / Table / Audit ── */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Tabs */}
          <div className="flex border-b border-slate-800 bg-slate-900 px-4 flex-shrink-0">
            {[
              { id: 'terminal', label: 'Terminal', icon: Terminal },
              { id: 'table', label: `Datos (${tableSource.length})`, icon: FileSpreadsheet },
              ...(auditResult ? [{ id: 'audit', label: `Auditoría`, icon: AlertCircle }] : []),
            ].map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setActiveTab(id as any)}
                className={`flex items-center gap-2 px-4 py-3 text-[11px] font-bold transition-colors border-b-2
                  ${activeTab === id ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-600 hover:text-slate-400'}`}>
                <Icon size={13} />{label}
              </button>
            ))}
          </div>

          {/* Terminal Tab */}
          {activeTab === 'terminal' && (
            <div ref={terminalRef} className="flex-1 overflow-y-auto p-5 font-mono text-[12px] leading-5 select-text">
              {lines.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-slate-700 gap-4">
                  <Cpu size={48} />
                  <p className="text-sm">Sube un archivo BOM Excel para comenzar el análisis</p>
                  <p className="text-xs">Formatos soportados: .xlsx, .xls</p>
                </div>
              )}
              {lines.map(l => (
                <div key={l.id} className="flex gap-3 leading-5">
                  {l.type !== 'blank' && l.type !== 'header' && (
                    <span className="text-slate-700 flex-shrink-0 text-[10px] pt-0.5">{l.ts}</span>
                  )}
                  <span className={`${lineColor[l.type]} whitespace-pre-wrap break-all ${l.type === 'header' ? 'w-full' : ''}`}>
                    {l.text}
                  </span>
                </div>
              ))}
              {processing && (
                <div className="flex items-center gap-2 text-blue-400 mt-2">
                  <span className="animate-spin inline-block">⟳</span>
                  <span>Procesando...</span>
                </div>
              )}
            </div>
          )}

          {/* Table Tab */}
          {activeTab === 'table' && (
            <div className="flex-1 overflow-auto">
              {tableSource.length === 0 ? (
                <div className="flex items-center justify-center h-full text-slate-700 text-sm">
                  Sin datos aún. Completa al menos el paso de normalización.
                </div>
              ) : (
                <table className="w-full text-[11px] font-mono">
                  <thead className="sticky top-0 bg-slate-800 text-slate-400 uppercase text-[10px] tracking-widest">
                    <tr>
                      {['#', 'ESTILO', 'INSUMO', 'CANTIDAD', 'MERMA', 'UNIDAD', 'BOM', 'FECHAINI', 'FECHAFIN'].map(h => (
                        <th key={h} className="px-3 py-2 text-left border-r border-slate-700 last:border-0">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {tableSource.map((r, i) => {
                      const isMissing = auditResult && auditResult.noMaster.some(n => n.INSUMO === r.INSUMO);
                      const isZero = r.CANTIDAD === 0;
                      return (
                        <tr key={r.INSUMO}
                          className={`transition-colors hover:bg-slate-800/50
                            ${isMissing ? 'bg-red-950/20' : isZero ? 'bg-yellow-950/20' : ''}`}>
                          <td className="px-3 py-1.5 text-slate-600">{i + 1}</td>
                          <td className="px-3 py-1.5 text-emerald-400">{r.ESTILO}</td>
                          <td className="px-3 py-1.5 text-slate-200">{r.INSUMO}</td>
                          <td className={`px-3 py-1.5 text-right font-bold ${isZero ? 'text-yellow-500' : 'text-slate-300'}`}>{r.CANTIDAD}</td>
                          <td className="px-3 py-1.5 text-slate-500 text-right">{r.MERMA}</td>
                          <td className="px-3 py-1.5 text-slate-400">{r.UNIDAD}</td>
                          <td className="px-3 py-1.5 text-slate-500">{r.BOM}</td>
                          <td className="px-3 py-1.5 text-slate-600">{r.FECHAINI ?? '—'}</td>
                          <td className="px-3 py-1.5 text-slate-600">{r.FECHAFIN ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-slate-900 border-t border-slate-700">
                    <tr>
                      <td colSpan={3} className="px-3 py-2 text-[10px] font-bold text-blue-400 uppercase tracking-widest">
                        TOTAL: {tableSource.length} insumos únicos
                      </td>
                      <td className="px-3 py-2 text-right text-emerald-400 font-bold text-[10px]">
                        {tableSource.reduce((a, r) => a + r.CANTIDAD, 0).toLocaleString()} pzas
                      </td>
                      <td colSpan={5} className="px-3 py-2 text-[10px] text-slate-600">
                        {auditResult && <span className="text-red-400">⚠ {auditResult.noMaster.length} sin MasterData</span>}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          )}

          {/* Audit Tab */}
          {activeTab === 'audit' && auditResult && (
            <div className="flex-1 overflow-y-auto p-5 space-y-6">

              {/* Stats Cards */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Sin MasterData', value: auditResult.noMaster.length, color: 'red', icon: XCircle },
                  { label: 'Régimen A1 (empaque)', value: auditResult.regimenA1.length, color: 'orange', icon: AlertTriangle },
                  { label: 'Outliers Cantidad', value: auditResult.outliers.length, color: 'yellow', icon: AlertCircle },
                  { label: 'Part# con "#"', value: auditResult.withHash.length, color: 'purple', icon: AlertCircle },
                ].map(({ label, value, color, icon: Icon }) => (
                  <div key={label} className={`bg-${color}-950/30 border border-${color}-900/50 rounded-xl p-3`}>
                    <div className={`flex items-center gap-2 text-${color}-400 text-[10px] font-bold uppercase mb-1`}>
                      <Icon size={12} />{label}
                    </div>
                    <p className={`text-2xl font-black text-${color}-300`}>{value}</p>
                  </div>
                ))}
              </div>

              {/* ── Catalog Validation Section ── */}
              {catalogValidation && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                    <BookOpen size={14} className="text-teal-400" />
                    <h2 className="text-teal-400 font-bold text-xs uppercase tracking-widest">Validación vs Catálogo de Productos</h2>
                    <span className="ml-auto text-[10px] text-slate-600">{catalogFileName}</span>
                  </div>

                  {/* Coverage summary row — now 4 cards including Año Modelo */}
                  {(() => {
                    const source2 = finalRows.length > 0 ? finalRows : dedupedRows.length > 0 ? dedupedRows : normalizedRows;
                    const bomEstilosUI = Array.from(new Set(source2.map(r => r.ESTILO)));
                    const years = Array.from(new Set(bomEstilosUI.map(extractModelYear).filter(Boolean))) as string[];
                    const yearLabel = years.length > 0 ? years.join(' / ') : '—';
                    return (
                      <div className="grid grid-cols-4 gap-3">
                        <div className="bg-teal-950/30 border border-teal-900/50 rounded-xl p-3">
                          <p className="text-[10px] text-teal-400 font-bold uppercase mb-1 flex items-center gap-1"><CheckCircle2 size={10}/>Estilos válidos</p>
                          <p className="text-2xl font-black text-teal-300">{catalogValidation.estilosValidos.length}</p>
                        </div>
                        <div className="bg-orange-950/30 border border-orange-900/50 rounded-xl p-3">
                          <p className="text-[10px] text-orange-400 font-bold uppercase mb-1 flex items-center gap-1"><AlertTriangle size={10}/>No en catálogo</p>
                          <p className="text-2xl font-black text-orange-300">{catalogValidation.estilosInvalidos.length}</p>
                        </div>
                        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3">
                          <p className="text-[10px] text-slate-400 font-bold uppercase mb-1 flex items-center gap-1"><AlertCircle size={10}/>Products sin BOM</p>
                          <p className="text-2xl font-black text-slate-300">{catalogValidation.modelsWithoutBOM.reduce((a, m) => a + m.products.length, 0)}</p>
                        </div>
                        <div className={`rounded-xl p-3 border ${yearColor(years[0])}`}>
                          <p className="text-[10px] font-bold uppercase mb-1 flex items-center gap-1 opacity-80">Año Modelo</p>
                          <p className="text-2xl font-black">{yearLabel}</p>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Valid styles table */}
                  {catalogValidation.estilosValidos.length > 0 && (
                    <div>
                      <h3 className="text-teal-400 font-bold text-[11px] uppercase tracking-widest flex items-center gap-2 mb-2">
                        <CheckCircle2 size={13}/> Estilos del BOM reconocidos en catálogo
                      </h3>
                      <div className="bg-slate-900 rounded-xl border border-teal-900/40 overflow-hidden">
                        <table className="w-full text-[11px] font-mono">
                          <thead className="bg-slate-800 text-slate-500 uppercase text-[10px]">
                            <tr>
                              <th className="px-3 py-2 text-left">ESTILO (Product No.)</th>
                              <th className="px-3 py-2 text-left">MODELO</th>
                              <th className="px-3 py-2 text-left">Hermanos sin BOM</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {catalogValidation.estilosValidos.map(({ estilo, modelo, siblings }) => (
                              <tr key={estilo} className="hover:bg-slate-800/50">
                                <td className="px-3 py-2 text-teal-300 font-bold">{estilo}</td>
                                <td className="px-3 py-2 text-slate-300">{modelo}</td>
                                <td className="px-3 py-2">
                                  {siblings.length === 0
                                    ? <span className="text-slate-600">—</span>
                                    : <div className="flex flex-wrap gap-1">
                                        {siblings.map(s => (
                                          <span key={s} className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">{s}</span>
                                        ))}
                                      </div>
                                  }
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Invalid styles */}
                  {catalogValidation.estilosInvalidos.length > 0 && (
                    <div>
                      <h3 className="text-orange-400 font-bold text-[11px] uppercase tracking-widest flex items-center gap-2 mb-2">
                        <AlertTriangle size={13}/> Estilos NO encontrados en catálogo
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {catalogValidation.estilosInvalidos.map(e => (
                          <span key={e} className="text-[11px] bg-orange-950/40 border border-orange-800/50 text-orange-300 px-3 py-1.5 rounded-lg font-mono font-bold">{e}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Models without BOM — grouped by year */}
                  {catalogValidation.modelsWithoutBOM.length > 0 && (() => {
                    // Collect all years present across products-without-BOM
                    const allYears: string[] = (Array.from(new Set(
                      catalogValidation.modelsWithoutBOM.flatMap(m => m.products.map((p): string => extractModelYear(p) ?? 'Desconocido'))
                    )) as string[]).sort();
                    return (
                      <div>
                        <h3 className="text-slate-400 font-bold text-[11px] uppercase tracking-widest flex items-center gap-2 mb-3">
                          <AlertCircle size={13}/> Modelos con products sin BOM asignado
                          <span className="text-slate-600 font-normal normal-case">({catalogValidation.modelsWithoutBOM.reduce((a,m)=>a+m.products.length,0)} products)</span>
                        </h3>

                        {/* Year breakdown badges */}
                        <div className="flex flex-wrap gap-2 mb-3">
                          {allYears.map(yr => {
                            const count = catalogValidation.modelsWithoutBOM.reduce((a, m) =>
                              a + m.products.filter(p => (extractModelYear(p) ?? 'Desconocido') === yr).length, 0);
                            return (
                              <span key={yr} className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-1 rounded-full border ${yearColor(yr)}`}>
                                {yr} <span className="opacity-60 font-normal">{count} sin BOM</span>
                              </span>
                            );
                          })}
                        </div>

                        <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
                          <table className="w-full text-[11px] font-mono">
                            <thead className="bg-slate-800 text-slate-500 uppercase text-[10px]">
                              <tr>
                                <th className="px-3 py-2 text-left">MODELO</th>
                                <th className="px-3 py-2 text-left">Products sin BOM (por año)</th>
                                <th className="px-3 py-2 text-right w-16">Qty</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                              {catalogValidation.modelsWithoutBOM
                                .sort((a,b) => b.products.length - a.products.length)
                                .map(({ modelo, products }) => {
                                  // Group this model's products by year
                                  const byYr: Record<string, string[]> = {};
                                  products.forEach(p => {
                                    const yr = extractModelYear(p) ?? 'Desconocido';
                                    if (!byYr[yr]) byYr[yr] = [];
                                    byYr[yr].push(p);
                                  });
                                  return (
                                    <tr key={modelo} className="hover:bg-slate-800/50 align-top">
                                      <td className="px-3 py-2 text-slate-300 font-bold whitespace-nowrap">{modelo}</td>
                                      <td className="px-3 py-2">
                                        <div className="space-y-1.5">
                                          {Object.entries(byYr).sort().map(([yr, prods]) => (
                                            <div key={yr} className="flex flex-wrap items-center gap-1">
                                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${yearColor(yr)}`}>{yr}</span>
                                              {prods.map(p => (
                                                <span key={p} className="text-[10px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded font-mono">{p}</span>
                                              ))}
                                            </div>
                                          ))}
                                        </div>
                                      </td>
                                      <td className="px-3 py-2 text-right text-slate-500 font-bold">{products.length}</td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* No MasterData Table */}
              {auditResult.noMaster.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-red-400 font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                      <XCircle size={14} /> Insumos sin registro en MasterData ({auditResult.noMaster.length})
                    </h3>
                    <button onClick={exportMissingMaster}
                      className="flex items-center gap-1 px-3 py-1.5 bg-red-900/30 text-red-400 border border-red-900 rounded-lg text-[11px] font-bold hover:bg-red-900/50 transition-colors">
                      <Download size={11} /> Exportar
                    </button>
                  </div>
                  <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
                    <table className="w-full text-[11px] font-mono">
                      <thead className="bg-slate-800 text-slate-500 uppercase text-[10px]">
                        <tr>
                          <th className="px-3 py-2 text-left">#</th>
                          <th className="px-3 py-2 text-left">INSUMO</th>
                          <th className="px-3 py-2 text-right">CANTIDAD</th>
                          <th className="px-3 py-2 text-left">NOTA</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {auditResult.noMaster.map((r, i) => {
                          let nota = 'Sin alta en MasterData';
                          let noteColor = 'text-red-400';
                          if (r.CANTIDAD === 0) { nota = 'Variante inactiva (CAN=0)'; noteColor = 'text-yellow-500'; }
                          else if (r.INSUMO.includes('#')) { nota = 'Part# comodín'; noteColor = 'text-purple-400'; }
                          else if (/-(0BP|0BB|0YG|0RE|0ET|0YD)/.test(r.INSUMO)) { nota = 'Variante de color'; noteColor = 'text-orange-400'; }
                          return (
                            <tr key={r.INSUMO} className="hover:bg-slate-800/50">
                              <td className="px-3 py-1.5 text-slate-600">{i + 1}</td>
                              <td className="px-3 py-1.5 text-slate-200">{r.INSUMO}</td>
                              <td className={`px-3 py-1.5 text-right font-bold ${r.CANTIDAD === 0 ? 'text-yellow-500' : 'text-slate-300'}`}>{r.CANTIDAD}</td>
                              <td className={`px-3 py-1.5 ${noteColor}`}>{nota}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Régimen A1 */}
              {auditResult.regimenA1.length > 0 && (
                <div>
                  <h3 className="text-orange-400 font-bold text-xs uppercase tracking-widest flex items-center gap-2 mb-2">
                    <AlertTriangle size={14} /> Insumos con Régimen A1 — Material de Empaque ({auditResult.regimenA1.length})
                  </h3>
                  <div className="bg-slate-900 rounded-xl border border-orange-900/50 overflow-hidden">
                    <table className="w-full text-[11px] font-mono">
                      <thead className="bg-slate-800/80 text-slate-500 uppercase text-[10px]">
                        <tr>
                          <th className="px-3 py-2 text-left">INSUMO</th>
                          <th className="px-3 py-2 text-left">RÉGIMEN</th>
                          <th className="px-3 py-2 text-left">DESCRIPCIÓN</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {auditResult.regimenA1.map(r => (
                          <tr key={r.insumo} className="hover:bg-slate-800/50">
                            <td className="px-3 py-1.5 text-slate-200">{r.insumo}</td>
                            <td className="px-3 py-1.5 text-orange-400 font-bold">{r.regimen}</td>
                            <td className="px-3 py-1.5 text-slate-400">{r.desc}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Outliers */}
              {auditResult.outliers.length > 0 && (
                <div>
                  <h3 className="text-yellow-400 font-bold text-xs uppercase tracking-widest flex items-center gap-2 mb-2">
                    <AlertCircle size={14} /> Outliers de Cantidad ({auditResult.outliers.length})
                  </h3>
                  <div className="bg-slate-900 rounded-xl border border-yellow-900/50 overflow-hidden">
                    <table className="w-full text-[11px] font-mono">
                      <thead className="bg-slate-800/80 text-slate-500 uppercase text-[10px]">
                        <tr>
                          <th className="px-3 py-2 text-left">INSUMO</th>
                          <th className="px-3 py-2 text-right">CANTIDAD</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {auditResult.outliers.sort((a, b) => b.CANTIDAD - a.CANTIDAD).map(r => (
                          <tr key={r.INSUMO} className="hover:bg-slate-800/50">
                            <td className="px-3 py-1.5 text-slate-200">{r.INSUMO}</td>
                            <td className="px-3 py-1.5 text-right text-yellow-400 font-black text-sm">{r.CANTIDAD}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  );
};
