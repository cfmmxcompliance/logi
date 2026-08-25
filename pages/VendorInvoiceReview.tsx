import React, { useState, useEffect } from 'react';
import { Search, Filter, CheckCircle, XCircle, FileText, Eye, AlertTriangle, ArrowRight, Check, X } from 'lucide-react';
import { storageService } from '../services/storageService';
import { VendorInvoice } from '../types';
import { useAuth } from '../context/useAuth';

export default function VendorInvoiceReview() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<VendorInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSearch, setActiveSearch] = useState('');

  // Fetch only when activeSearch changes and is not empty
  useEffect(() => {
    if (activeSearch) {
      fetchPendingInvoices();
    } else {
      setInvoices([]);
    }
  }, [activeSearch]);

  const fetchPendingInvoices = async () => {
    try {
      setLoading(true);
      // Fetching vendor invoices
      const data = await storageService.getAllVendorInvoices?.() || [];
      // Filter by status for the review queue
      setInvoices(data.filter((i: VendorInvoice) => ['SUBIDA', 'EN_REVISION'].includes(i.status)));
    } catch (error) {
      console.error('Error fetching invoices for review:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (id: string, action: 'APROBADA' | 'RECHAZADA') => {
    try {
      if (action === 'RECHAZADA') {
        const reason = prompt('Motivo del rechazo:');
        if (!reason) return;
        await storageService.updateVendorInvoiceStatus(id, 'RECHAZADA', reason, user?.email || 'admin');
      } else {
        await storageService.updateVendorInvoiceStatus(id, 'APROBADA', '', user?.email || 'admin');
      }
      fetchPendingInvoices();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  // Mass query filtering logic (comma separated values)
  const filteredInvoices = invoices.filter(inv => {
    if (filter !== 'ALL' && inv.status !== filter) return false;
    
    if (activeSearch) {
      const terms = activeSearch.split(',').map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
      if (terms.length > 0) {
        const rowSearchStr = `${inv.vendorName} ${inv.vendorRfc} ${inv.invoiceNo} ${inv.uuid}`.toLowerCase();
        return terms.some(term => rowSearchStr.includes(term));
      }
    }
    return true;
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveSearch(searchTerm);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8 space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Revisión de Facturas (Proveedores)</h1>
          <p className="text-gray-500 mt-1">Cola de facturas pendientes de revisión y aprobación.</p>
        </div>
        
        {activeSearch && (
          <div className="flex bg-white rounded-2xl shadow-sm border border-gray-100 p-1.5">
            <button 
              onClick={() => setFilter('ALL')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${filter === 'ALL' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              Todas
            </button>
            <button 
              onClick={() => setFilter('SUBIDA')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${filter === 'SUBIDA' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              Nuevas
            </button>
            <button 
              onClick={() => setFilter('EN_REVISION')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${filter === 'EN_REVISION' ? 'bg-amber-50 text-amber-700' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              En Revisión
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
        {!activeSearch && invoices.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-gray-500 min-h-[500px]">
            <Search className="h-16 w-16 text-gray-300 mb-6" />
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">Buscar Facturas de Proveedores</h2>
            <p className="text-gray-500 mb-8 max-w-md">
              Ingresa el RFC, Folio, UUID o Nombre del proveedor para buscar facturas. Puedes buscar varios a la vez separados por comas (Mass Query).
            </p>
            <form onSubmit={handleSearch} className="w-full max-w-2xl flex gap-3 relative">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
                <input
                  type="text"
                  placeholder="Ej. LOG123456789, F-1020, 8A9F..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-lg"
                  autoFocus
                />
              </div>
              <button 
                type="submit" 
                className="px-8 py-4 bg-indigo-600 text-white font-medium rounded-2xl hover:bg-indigo-700 transition-colors shadow-sm"
              >
                Buscar
              </button>
            </form>
          </div>
        ) : (
          <>
            <div className="p-6 border-b border-gray-100 flex gap-4">
              <form onSubmit={handleSearch} className="relative flex-1 flex gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
                  <input 
                    type="text" 
                    placeholder="Buscar por RFC, Proveedor o Folio (separados por coma)..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                  />
                  {searchTerm && (
                    <button 
                      type="button"
                      onClick={() => {
                        setSearchTerm('');
                        setActiveSearch('');
                      }}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X size={18} />
                    </button>
                  )}
                </div>
                <button type="submit" className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-colors">
                  Buscar
                </button>
              </form>
              <button className="px-6 py-3 bg-white border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-2">
                <Filter size={18} /> Filtros
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center p-20">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
              </div>
            ) : filteredInvoices.length === 0 ? (
              <div className="text-center p-20 text-gray-500">
                <CheckCircle className="mx-auto h-16 w-16 text-emerald-400 mb-4" />
                <h3 className="text-xl font-medium text-gray-900 mb-1">Sin Resultados</h3>
                <p>No se encontraron facturas pendientes para "{activeSearch}".</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-sm">
                      <th className="py-4 px-6 font-medium">Proveedor</th>
                      <th className="py-4 px-6 font-medium">Factura / Fecha</th>
                      <th className="py-4 px-6 font-medium">Importe</th>
                      <th className="py-4 px-6 font-medium">Estado</th>
                      <th className="py-4 px-6 font-medium text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredInvoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                        <td className="py-5 px-6">
                          <p className="font-bold text-gray-900">{inv.vendorName}</p>
                          <p className="text-sm text-gray-500 font-mono">{inv.vendorRfc}</p>
                        </td>
                        <td className="py-5 px-6">
                          <p className="font-medium text-gray-900">{inv.invoiceNo} <span className="text-xs text-gray-400">({inv.uuid?.substring(0, 8)})</span></p>
                          <p className="text-sm text-gray-500">{new Date(inv.issueDate).toLocaleDateString()}</p>
                        </td>
                        <td className="py-5 px-6">
                          <p className="font-bold text-gray-900">${inv.total.toLocaleString()} {inv.currency}</p>
                          <p className="text-xs text-gray-500">{inv.concepts?.length || 0} conceptos</p>
                        </td>
                        <td className="py-5 px-6">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium
                            ${inv.status === 'SUBIDA' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                            {inv.status}
                          </span>
                        </td>
                        <td className="py-5 px-6 text-right space-x-2">
                          <button className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors tooltip-trigger" title="Ver Detalle">
                            <Eye size={20} />
                          </button>
                          <button onClick={() => handleAction(inv.id, 'APROBADA')} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors tooltip-trigger" title="Aprobar rápida">
                            <Check size={20} />
                          </button>
                          <button onClick={() => handleAction(inv.id, 'RECHAZADA')} className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors tooltip-trigger" title="Rechazar">
                            <X size={20} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
