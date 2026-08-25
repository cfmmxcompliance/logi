import React, { useState, useEffect } from 'react';
import { UploadCloud, FileText, CheckCircle, Clock, AlertCircle, File, DollarSign, Check, X, FileCheck, Send, Archive } from 'lucide-react';
import { storageService } from '../services/storageService';
import { useAuth } from '../context/useAuth';
import { VendorInvoice } from '../types';

export default function VendorPortal() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<VendorInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    fetchInvoices();
  }, [user]);

  const fetchInvoices = async () => {
    if (!user || !user.rfc) return;
    try {
      setLoading(true);
      const data = await storageService.getVendorInvoicesByRFC(user.rfc);
      setInvoices(data || []);
    } catch (error) {
      console.error('Error fetching invoices:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      // Logic to process files...
      alert(`Archivo detectado: ${e.dataTransfer.files[0].name}. (Simulación de carga)`);
    }
  };

  const stats = {
    total: invoices.length,
    enRevision: invoices.filter(i => i.status === 'EN_REVISION').length,
    aprobadas: invoices.filter(i => i.status === 'APROBADA').length,
    pendientePago: invoices.filter(i => i.status !== 'PAGADA' && i.status !== 'RECHAZADA').reduce((acc, curr) => acc + curr.total, 0)
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8 space-y-8">
      {/* Header */}
      <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Portal de Proveedores</h1>
            <p className="text-gray-500 mt-1">Bienvenido, {user?.name || 'Proveedor'} ({user?.rfc || 'Sin RFC'})</p>
          </div>
          <div className="p-4 bg-indigo-50 rounded-2xl flex items-center gap-3">
            <DollarSign className="text-indigo-600 h-8 w-8" />
            <div>
              <p className="text-sm font-medium text-indigo-900">Total Pendiente</p>
              <p className="text-2xl font-bold text-indigo-700">${stats.pendientePago.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 flex items-center gap-4">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-xl"><FileText size={24} /></div>
            <div>
              <p className="text-sm font-medium text-gray-500">Facturas Enviadas</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
          </div>
          <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 flex items-center gap-4">
            <div className="p-3 bg-amber-100 text-amber-600 rounded-xl"><Clock size={24} /></div>
            <div>
              <p className="text-sm font-medium text-gray-500">En Revisión</p>
              <p className="text-2xl font-bold text-gray-900">{stats.enRevision}</p>
            </div>
          </div>
          <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 flex items-center gap-4">
            <div className="p-3 bg-green-100 text-green-600 rounded-xl"><CheckCircle size={24} /></div>
            <div>
              <p className="text-sm font-medium text-gray-500">Aprobadas</p>
              <p className="text-2xl font-bold text-gray-900">{stats.aprobadas}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Upload Zone */}
      <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <UploadCloud className="text-indigo-600" /> Cargar Nueva Factura
        </h2>
        <div 
          className={`border-2 border-dashed rounded-3xl p-12 text-center transition-all duration-300 ${dragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <UploadCloud className={`mx-auto h-16 w-16 mb-4 ${dragActive ? 'text-indigo-600' : 'text-gray-400'}`} />
          <h3 className="text-lg font-medium text-gray-900 mb-1">Arrastra tus archivos aquí</h3>
          <p className="text-gray-500 mb-6">Soporta XML, PDF o un archivo ZIP con múltiples facturas</p>
          <button className="px-6 py-3 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-800 transition-colors shadow-md">
            Seleccionar Archivos
          </button>
        </div>
      </div>

      {/* Invoices List */}
      <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          <Archive className="text-indigo-600" /> Mis Facturas Recientes
        </h2>
        
        {loading ? (
          <div className="flex justify-center p-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        ) : invoices.length === 0 ? (
          <div className="text-center p-12 text-gray-500">
            <FileText className="mx-auto h-12 w-12 text-gray-300 mb-3" />
            <p>No tienes facturas registradas aún.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500 text-sm">
                  <th className="py-4 px-4 font-medium">Folio</th>
                  <th className="py-4 px-4 font-medium">Fecha</th>
                  <th className="py-4 px-4 font-medium">UUID</th>
                  <th className="py-4 px-4 font-medium">Total</th>
                  <th className="py-4 px-4 font-medium">Estatus</th>
                  <th className="py-4 px-4 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-4 font-medium text-gray-900">{inv.invoiceNo}</td>
                    <td className="py-4 px-4 text-gray-600">{new Date(inv.issueDate).toLocaleDateString()}</td>
                    <td className="py-4 px-4 text-gray-500 text-xs font-mono">{inv.uuid?.substring(0, 8)}...</td>
                    <td className="py-4 px-4 font-bold text-gray-900">${inv.total.toLocaleString()} {inv.currency}</td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium
                        ${inv.status === 'SUBIDA' ? 'bg-blue-100 text-blue-700' : 
                          inv.status === 'EN_REVISION' ? 'bg-amber-100 text-amber-700' :
                          inv.status === 'APROBADA' ? 'bg-green-100 text-green-700' :
                          inv.status === 'PAGADA' ? 'bg-emerald-100 text-emerald-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <button className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
