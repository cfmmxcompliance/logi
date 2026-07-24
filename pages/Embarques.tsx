import React, { useState, useEffect } from 'react';
import { Package, Search, Download, RefreshCw, Loader2, Calendar, Trash2 , ChevronUp, ChevronDown} from 'lucide-react';
import { contratoService } from '../services/contratoService.ts';
import { ContratoRecord } from '../types/contrato';
import * as XLSX from 'xlsx';

// Helper for Mexico City date (YYYY-MM-DD)
const getMexicoDateString = () => {
  const mxDate = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" }));
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${mxDate.getFullYear()}-${pad(mxDate.getMonth() + 1)}-${pad(mxDate.getDate())}`;
};

export const Embarques: React.FC = () => {
  const [data, setData] = useState<ContratoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [startDate, setStartDate] = useState(getMexicoDateString());
  const [endDate, setEndDate] = useState(getMexicoDateString());

  const [activeTab, setActiveTab] = useState<'TODOS' | 'CON_CONTRATO' | 'SIN_CONTRATO'>('TODOS');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setSelectedIds(new Set());
    try {
      const asigData = await contratoService.getContratosByDateRange(startDate, endDate);
      setData(asigData);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [startDate, endDate]);

  const filteredData = data.filter(item => {
    const hasContrato = !!item.contrato;
    if (activeTab === 'CON_CONTRATO' && !hasContrato) return false;
    if (activeTab === 'SIN_CONTRATO' && hasContrato) return false;

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

  const sortedData = [...filteredData];
  if (sortConfig) {
    sortedData.sort((a, b) => {
      let valA: string = (a[sortConfig.key as keyof ContratoRecord] || '').toString().toLowerCase();
      let valB: string = (b[sortConfig.key as keyof ContratoRecord] || '').toString().toLowerCase();

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }

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

  const SortableHeader = ({ label, sortKey }: { label: string, sortKey: string }) => (
    <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">
      <div 
        onClick={() => handleSort(sortKey)} 
        className={`flex items-center gap-1 cursor-pointer hover:text-indigo-600 transition-colors group select-none ${sortConfig?.key === sortKey ? 'text-indigo-700 font-bold' : ''}`}
      >
        {label}
        {renderSortIcon(sortKey)}
      </div>
    </th>
  );

  const toggleSelectAll = () => {
    if (selectedIds.size === sortedData.length && sortedData.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedData.map(item => item.id!)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`¿Estás seguro de que deseas eliminar ${selectedIds.size} registro(s)?`)) return;

    setIsDeleting(true);
    try {
      for (const id of selectedIds) {
        await contratoService.deleteContrato(id);
      }
      await fetchData();
    } catch (error) {
      console.error("Error deleting contratos:", error);
      alert("Hubo un error al eliminar los registros.");
    } finally {
      setIsDeleting(false);
    }
  };

  const exportToExcel = () => {
    const exportData = sortedData.map(item => ({
      'NO. OPERACIÓN': item.numeroOperacion || '',
      'NÚMERO CAJA': item.numeroCaja || '',
      'SELLO ASIGNADO': item.selloAsignado || '',
      'CONTRATO': item.contrato || ''
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
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Embarques</h1>
            <p className="text-slate-500 text-sm mt-1">
              Revisión de Contratos y datos de Embarque.
            </p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="shrink-0 px-6 py-4 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-4">
        
        <div className="flex items-center gap-4">
          {/* Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('TODOS')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === 'TODOS' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setActiveTab('CON_CONTRATO')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === 'CON_CONTRATO' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              Con Contrato
            </button>
            <button
              onClick={() => setActiveTab('SIN_CONTRATO')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === 'SIN_CONTRATO' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              Sin Contrato
            </button>
          </div>
          
          {selectedIds.size > 0 && (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {isDeleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
              Borrar ({selectedIds.size})
            </button>
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
                const today = getMexicoDateString();
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
            <table className="w-full text-left border-collapse min-w-max">
              <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="py-3 px-4 w-12 border-b border-slate-200">
                    <input 
                      type="checkbox" 
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      checked={sortedData.length > 0 && selectedIds.size === sortedData.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <SortableHeader label="No. Operación" sortKey="numeroOperacion" />
                  <SortableHeader label="Caja" sortKey="numeroCaja" />
                  <SortableHeader label="Sello Asignado" sortKey="selloAsignado" />
                  <SortableHeader label="Contrato" sortKey="contrato" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center">
                      <Loader2 className="animate-spin text-indigo-500 mx-auto" size={32} />
                      <p className="text-slate-500 mt-2 text-sm">Cargando contratos...</p>
                    </td>
                  </tr>
                ) : sortedData.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-500">
                      No se encontraron registros en estas fechas.
                    </td>
                  </tr>
                ) : (
                  sortedData.map((item) => (
                    <tr 
                      key={item.id} 
                      className={`hover:bg-slate-50 transition-colors ${selectedIds.has(item.id!) ? 'bg-indigo-50/30' : ''}`}
                    >
                      <td className="py-3 px-4">
                        <input 
                          type="checkbox"
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          checked={selectedIds.has(item.id!)}
                          onChange={() => toggleSelect(item.id!)}
                        />
                      </td>
                      <td className="py-3 px-4 text-sm font-medium text-slate-900">
                        {item.numeroOperacion || '-'}
                      </td>
                      <td className="py-3 px-4 text-sm font-medium text-slate-900">
                        {item.numeroCaja || '-'}
                      </td>
                      <td className="py-3 px-4 text-sm font-medium text-slate-900">
                        {item.selloAsignado || '-'}
                      </td>
                      <td className="py-3 px-4 text-sm">
                        {item.contrato ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 font-medium border border-emerald-100">
                            {item.contrato}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Sin capturar</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
