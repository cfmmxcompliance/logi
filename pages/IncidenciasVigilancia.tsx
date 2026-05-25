// ─────────────────────────────────────────────────────────────────────────────
// pages/IncidenciasVigilancia.tsx
// Módulo Admin-Only: Incidencias de Vigilancia (Discrepancias detectadas)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  AlertTriangle, Search, Download, RefreshCw, Filter,
  Calendar, CheckCircle, XCircle, X, ChevronUp, ChevronDown, Shield
} from 'lucide-react';
import { vigilanciaService } from '../services/vigilanciaService.ts';
import { asignacionCajaService } from '../services/asignacionCajaService.ts';
import { VigilanciaRecord } from '../types/vigilancia.ts';
import { AsignacionCajaModel } from '../types/asignacionCaja.ts';
import { CatalogQueryBuilder, QueryCondition, evaluateCondition } from '../components/CatalogQueryBuilder';

// ── Types ──────────────────────────────────────────────────────────────────────
type SortDir = 'asc' | 'desc';
type SortKey = keyof VigilanciaRecord | 'nombreDriver' | 'subLinea';

interface EnrichedRecord extends VigilanciaRecord {
  nombreDriver?: string;
  subLinea?: string;
  placasCajaSistema?: string;
  placasTractoSistema?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const toLocalDate = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });

const Bool = ({ value }: { value?: boolean }) =>
  value === true
    ? <CheckCircle size={16} className="text-emerald-500 mx-auto" />
    : value === false
      ? <XCircle size={16} className="text-red-500 mx-auto" />
      : <span className="text-slate-400 text-xs mx-auto">—</span>;

// ── Component ──────────────────────────────────────────────────────────────────
export const IncidenciasVigilancia: React.FC = () => {
  const today = toLocalDate();
  const [records, setRecords]         = useState<EnrichedRecord[]>([]);
  const [loading, setLoading]         = useState(true);
  const [dateRange, setDateRange]     = useState({ start: today, end: today });
  const [searchTerm, setSearchTerm]   = useState('');
  const [sortConfig, setSortConfig]   = useState<{ key: SortKey; dir: SortDir }>({ key: 'fechaHoraRegistro', dir: 'desc' });
  const [massConditions, setMassConditions] = useState<QueryCondition[]>([]);
  const [isMassOpen, setIsMassOpen]   = useState(false);
  const activeMassQuery = massConditions.length > 0;

  // ── Load ────────────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [allVigs, allAsigs] = await Promise.all([
        vigilanciaService.getByDateRange(dateRange.start, dateRange.end),
        asignacionCajaService.getAsignacionesByDate(dateRange.start),
      ]);

      // Filter only discrepancias
      const disc = allVigs.filter(v => v.discrepancia === true);

      // Enrich with asignacion data (join by asignacionCajaId)
      const asigMap = new Map<string, AsignacionCajaModel>();
      allAsigs.forEach(a => { if (a.id) asigMap.set(a.id, a); });

      const enriched: EnrichedRecord[] = disc.map(v => {
        const asig = asigMap.get(v.asignacionCajaId);
        return {
          ...v,
          nombreDriver: asig?.nombreDriver,
          subLinea: asig?.subLinea,
          placasCajaSistema: asig?.placasCaja,
          placasTractoSistema: asig?.placasTracto,
        };
      });

      setRecords(enriched);
    } catch (e) {
      console.error('IncidenciasVigilancia loadData error:', e);
    } finally {
      setLoading(false);
    }
  }, [dateRange.start, dateRange.end]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Filter + Sort ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = [...records];

    // Multi-term search
    if (searchTerm.trim()) {
      const terms = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
      result = result.filter(r =>
        terms.every(t =>
          (r.numeroCaja || '').toLowerCase().includes(t) ||
          (r.nombreDriver || '').toLowerCase().includes(t) ||
          (r.subLinea || '').toLowerCase().includes(t) ||
          (r.placasCajaFisica || '').toLowerCase().includes(t) ||
          (r.placasTractoFisica || '').toLowerCase().includes(t) ||
          (r.discrepanciaDetalle || '').toLowerCase().includes(t) ||
          (r.usuario || '').toLowerCase().includes(t)
        )
      );
    }

    // Mass query conditions
    if (activeMassQuery) {
      result = result.filter(r =>
        massConditions.every(cond => evaluateCondition(r as any, cond))
      );
    }

    // Sort
    result.sort((a, b) => {
      const va = String((a as any)[sortConfig.key] ?? '').toLowerCase();
      const vb = String((b as any)[sortConfig.key] ?? '').toLowerCase();
      return sortConfig.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });

    return result;
  }, [records, searchTerm, massConditions, activeMassQuery, sortConfig]);

  // ── Sort handler ────────────────────────────────────────────────────────────
  const handleSort = (key: SortKey) =>
    setSortConfig(prev => ({
      key,
      dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc',
    }));

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortConfig.key === k
      ? sortConfig.dir === 'asc'
        ? <ChevronUp size={12} className="text-blue-500" />
        : <ChevronDown size={12} className="text-blue-500" />
      : <ChevronUp size={12} className="text-slate-300" />;

  // ── CSV Export ──────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const headers = [
      'Fecha', 'Hora Registro', 'Caja', 'Chofer', 'Sub-Línea',
      'Chofer OK', 'Caja OK', 'Tracto OK',
      'Placas Caja Física', 'Placas Tracto Física',
      'Placas Caja Sistema', 'Placas Tracto Sistema',
      'Detalle Discrepancia', 'Inspector',
    ];
    const rows = filtered.map(r => [
      r.fecha,
      r.fechaHoraRegistro,
      r.numeroCaja,
      r.nombreDriver || '',
      r.subLinea || '',
      r.validacionChofer ? 'SÍ' : 'NO',
      r.validacionCaja ? 'SÍ' : 'NO',
      r.validacionTracto ? 'SÍ' : 'NO',
      r.placasCajaFisica || '',
      r.placasTractoFisica || '',
      r.placasCajaSistema || '',
      r.placasTractoSistema || '',
      (r.discrepanciaDetalle || '').replace(/,/g, ';'),
      r.usuario,
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Incidencias_Vigilancia_${dateRange.start}_${dateRange.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-slate-50 overflow-hidden">

      {/* ── Header ── */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-8 py-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
            <AlertTriangle size={22} className="text-red-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              Incidencias_Vigilancia
              {filtered.length > 0 && (
                <span className="text-xs font-bold text-white bg-red-500 px-2 py-0.5 rounded-full animate-pulse">
                  {filtered.length}
                </span>
              )}
            </h1>
            <p className="text-slate-500 text-sm">Discrepancias detectadas en validación de identidad de choferes y unidades</p>
          </div>
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-8 py-3 flex items-center gap-3 flex-wrap">
        {/* Multi-search */}
        <div className="flex items-center bg-white border border-slate-300 rounded-lg px-3 py-2 gap-2 shadow-sm min-w-[220px]">
          <Search size={14} className="text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Búsqueda multi-término..."
            className="outline-none text-sm text-slate-600 bg-transparent flex-1"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="text-slate-400 hover:text-slate-700">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Date range */}
        <div className="flex items-center bg-white border border-slate-300 rounded-lg pr-2 overflow-hidden shadow-sm">
          <button
            onClick={() => setDateRange({ start: today, end: today })}
            className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold px-3 py-2 text-xs border-r border-slate-200 transition-colors"
          >
            HOY
          </button>
          <Calendar size={14} className="text-slate-400 ml-2" />
          <input
            type="date"
            value={dateRange.start}
            onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
            className="py-2 px-2 text-sm outline-none text-slate-600 bg-transparent"
          />
          <span className="text-slate-300">-</span>
          <input
            type="date"
            value={dateRange.end}
            onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
            className="py-2 px-2 text-sm outline-none text-slate-600 bg-transparent"
          />
        </div>

        {/* Mass filter */}
        <button
          onClick={() => setIsMassOpen(true)}
          className={`px-4 py-2 flex items-center rounded-lg border text-sm font-medium transition-colors shadow-sm ${
            activeMassQuery
              ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
              : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Filter size={16} className="mr-2" />
          Filtros Masivos
          {activeMassQuery && (
            <span className="ml-2 bg-indigo-600 text-white rounded-full text-xs px-1.5 py-0.5">{massConditions.length}</span>
          )}
        </button>

        {/* Export */}
        <button
          onClick={exportCSV}
          disabled={filtered.length === 0}
          className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 text-slate-700 rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2"
        >
          <Download size={16} />
          Exportar
        </button>

        {/* Refresh */}
        <button
          onClick={loadData}
          disabled={loading}
          className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>

        {/* Record count */}
        <span className="ml-auto text-xs text-slate-500 font-medium">
          {loading ? 'Cargando...' : `${filtered.length} incidencia${filtered.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <RefreshCw size={32} className="animate-spin mb-3" />
            <p className="text-sm">Cargando incidencias...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <Shield size={48} className="mb-3 text-emerald-300" />
            <p className="text-base font-semibold text-slate-500">Sin incidencias en el período</p>
            <p className="text-sm text-slate-400">Todas las validaciones coinciden con el sistema</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-100 border-b border-slate-200">
                {[
                  { key: 'fechaHoraRegistro', label: 'FECHA / HORA' },
                  { key: 'numeroCaja',         label: 'CAJA'         },
                  { key: 'nombreDriver',        label: 'CHOFER'       },
                  { key: 'subLinea',            label: 'SUB-LÍNEA'    },
                  { key: 'validacionChofer',    label: '¿CHOFER?'     },
                  { key: 'validacionCaja',      label: '¿CAJA?'       },
                  { key: 'validacionTracto',    label: '¿TRACTO?'     },
                  { key: 'placasCajaFisica',    label: 'PLAC. CAJA FÍSICAS'   },
                  { key: 'placasTractoFisica',  label: 'PLAC. TRACTO FÍSICAS' },
                  { key: 'placasCajaSistema',   label: 'PLAC. CAJA SISTEMA'   },
                  { key: 'placasTractoSistema', label: 'PLAC. TRACTO SISTEMA' },
                  { key: 'discrepanciaDetalle', label: 'DETALLE'      },
                  { key: 'usuario',             label: 'INSPECTOR'    },
                ].map(col => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key as SortKey)}
                    className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-200 whitespace-nowrap select-none"
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      <SortIcon k={col.key as SortKey} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const rowHasMultiple = [r.validacionChofer, r.validacionCaja, r.validacionTracto].filter(v => v === false).length;
                return (
                  <tr
                    key={r.id}
                    className={`border-b border-slate-100 hover:bg-red-50 transition-colors ${
                      i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                    }`}
                  >
                    {/* Fecha/Hora */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-slate-700 text-xs font-mono">{r.fechaHoraRegistro || r.fecha}</span>
                    </td>
                    {/* Caja */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-bold text-slate-800 font-mono">{r.numeroCaja}</span>
                    </td>
                    {/* Chofer */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-slate-700">{r.nombreDriver || '—'}</span>
                    </td>
                    {/* Sub-Línea */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-blue-600 font-medium text-xs">{r.subLinea || '—'}</span>
                    </td>
                    {/* Validación Chofer */}
                    <td className="px-4 py-3 text-center">
                      <Bool value={r.validacionChofer} />
                    </td>
                    {/* Validación Caja */}
                    <td className="px-4 py-3 text-center">
                      <Bool value={r.validacionCaja} />
                    </td>
                    {/* Validación Tracto */}
                    <td className="px-4 py-3 text-center">
                      <Bool value={r.validacionTracto} />
                    </td>
                    {/* Placas Caja Física */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`font-mono text-xs px-2 py-1 rounded ${
                        r.placasCajaFisica && r.placasCajaSistema && r.placasCajaFisica !== r.placasCajaSistema
                          ? 'bg-red-100 text-red-700 font-bold'
                          : 'text-slate-700'
                      }`}>
                        {r.placasCajaFisica || '—'}
                      </span>
                    </td>
                    {/* Placas Tracto Física */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`font-mono text-xs px-2 py-1 rounded ${
                        r.placasTractoFisica && r.placasTractoSistema && r.placasTractoFisica !== r.placasTractoSistema
                          ? 'bg-red-100 text-red-700 font-bold'
                          : 'text-slate-700'
                      }`}>
                        {r.placasTractoFisica || '—'}
                      </span>
                    </td>
                    {/* Placas Caja Sistema */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs text-slate-500">{r.placasCajaSistema || '—'}</span>
                    </td>
                    {/* Placas Tracto Sistema */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs text-slate-500">{r.placasTractoSistema || '—'}</span>
                    </td>
                    {/* Detalle */}
                    <td className="px-4 py-3 max-w-xs">
                      <span className="text-red-700 text-xs">{r.discrepanciaDetalle || '—'}</span>
                    </td>
                    {/* Inspector */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-slate-500 text-xs">{r.usuario}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Mass Query Builder Modal ── */}
      {isMassOpen && (
        <CatalogQueryBuilder
          conditions={massConditions}
          onChange={setMassConditions}
          onClose={() => setIsMassOpen(false)}
          fields={[
            { key: 'numeroCaja',        label: 'Caja',                type: 'string' },
            { key: 'nombreDriver',       label: 'Chofer',              type: 'string' },
            { key: 'subLinea',           label: 'Sub-Línea',           type: 'string' },
            { key: 'validacionChofer',   label: '¿Chofer OK?',         type: 'boolean' },
            { key: 'validacionCaja',     label: '¿Caja OK?',           type: 'boolean' },
            { key: 'validacionTracto',   label: '¿Tracto OK?',         type: 'boolean' },
            { key: 'placasCajaFisica',   label: 'Placas Caja Físicas', type: 'string' },
            { key: 'placasTractoFisica', label: 'Placas Tracto Físicas', type: 'string' },
            { key: 'discrepanciaDetalle',label: 'Detalle',             type: 'string' },
            { key: 'usuario',            label: 'Inspector',           type: 'string' },
            { key: 'fecha',              label: 'Fecha',               type: 'string' },
          ]}
        />
      )}
    </div>
  );
};
