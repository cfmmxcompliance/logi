import React, { useState, useEffect } from 'react';
import { FolderOpen, Plus, DollarSign, FileCheck, CheckCircle, Upload, Check, File, Settings, FileText, X } from 'lucide-react';
import { storageService } from '../services/storageService';
import { ExpenseAccount, VendorInvoice } from '../types';
import { useAuth } from '../context/useAuth';

export default function ExpenseAccounts() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<ExpenseAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState<ExpenseAccount | null>(null);
  const [activeTab, setActiveTab] = useState('BORRADOR');

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      // Fetch expense accounts
      const data = await storageService.getExpenseAccounts?.() || [];
      setAccounts(data);
    } catch (error) {
      console.error('Error fetching accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const createNewAccount = async () => {
    const newAccount: any = {
      id: `cg-${Date.now()}`,
      accountNo: `CG-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000)}`,
      description: 'Nueva Cuenta de Gastos',
      vendorInvoiceIds: [],
      invoiceLinks: {},
      totalMXN: 0,
      totalUSD: 0,
      status: 'BORRADOR',
      statusHistory: [],
      createdAt: new Date().toISOString(),
      createdBy: user?.email || 'admin'
    };
    
    try {
      // Mocked save
      if (storageService.createExpenseAccount) {
        await storageService.createExpenseAccount(newAccount);
      }
      setAccounts([newAccount, ...accounts]);
      setSelectedAccount(newAccount);
      setActiveTab('BORRADOR');
    } catch (e) {
      console.error(e);
    }
  };

  const filteredAccounts = accounts.filter(a => a.status === activeTab);

  return (
    <div className="h-[calc(100vh-80px)] bg-gray-50 flex gap-6 p-6">
      {/* Panel Izquierdo: Lista de Cuentas */}
      <div className="w-1/3 bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col h-full overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <FolderOpen className="text-indigo-600" /> Cuentas de Gastos
            </h2>
            <button 
              onClick={createNewAccount}
              className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
              title="Nueva Cuenta"
            >
              <Plus size={20} />
            </button>
          </div>
          
          <div className="flex bg-gray-50 p-1 rounded-xl w-full">
            {['BORRADOR', 'EN_REVISION', 'APROBADA', 'PAGADA'].map(tab => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 text-xs py-2 px-1 rounded-lg font-medium transition-all ${
                  activeTab === tab ? 'bg-white text-indigo-700 shadow-sm border border-gray-100' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
             <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>
          ) : filteredAccounts.length === 0 ? (
            <div className="text-center p-8 text-gray-400 text-sm">
              No hay cuentas en este estatus.
            </div>
          ) : (
            filteredAccounts.map(acc => (
              <div 
                key={acc.id} 
                onClick={() => setSelectedAccount(acc)}
                className={`p-4 rounded-2xl cursor-pointer border transition-all ${
                  selectedAccount?.id === acc.id 
                    ? 'bg-indigo-50 border-indigo-200' 
                    : 'bg-white border-gray-100 hover:border-indigo-100 hover:bg-gray-50'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-gray-900 text-sm">{acc.accountNo}</h3>
                  <span className="text-xs bg-white px-2 py-0.5 rounded-full border border-gray-200 text-gray-600 font-mono">
                    {acc.vendorInvoiceIds.length} facs
                  </span>
                </div>
                <p className="text-xs text-gray-500 line-clamp-1 mb-3">{acc.description}</p>
                <div className="flex justify-between items-end">
                  <span className="text-[10px] text-gray-400">{new Date(acc.createdAt).toLocaleDateString()}</span>
                  <div className="text-right">
                    {acc.totalMXN > 0 && <p className="text-sm font-bold text-gray-900">${acc.totalMXN.toLocaleString()} <span className="text-xs text-gray-500">MXN</span></p>}
                    {acc.totalUSD > 0 && <p className="text-sm font-bold text-gray-900">${acc.totalUSD.toLocaleString()} <span className="text-xs text-gray-500">USD</span></p>}
                    {acc.totalMXN === 0 && acc.totalUSD === 0 && <p className="text-sm font-bold text-gray-400">$0.00</p>}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Panel Derecho: Detalle / Editor */}
      <div className="w-2/3 bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col h-full overflow-hidden">
        {selectedAccount ? (
          <>
            {/* Encabezado */}
            <div className="p-8 border-b border-gray-100 bg-white">
              <div className="flex justify-between items-start">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{selectedAccount.accountNo}</h1>
                  {selectedAccount.status === 'BORRADOR' ? (
                    <input 
                      type="text" 
                      value={selectedAccount.description}
                      onChange={(e) => setSelectedAccount({...selectedAccount, description: e.target.value})}
                      className="mt-2 w-full text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Descripción de la cuenta..."
                    />
                  ) : (
                    <p className="text-gray-500 mt-1">{selectedAccount.description}</p>
                  )}
                </div>
                
                <div className="flex items-center gap-3">
                  <div className={`px-4 py-2 rounded-xl text-sm font-bold
                    ${selectedAccount.status === 'BORRADOR' ? 'bg-gray-100 text-gray-700' :
                      selectedAccount.status === 'EN_REVISION' ? 'bg-amber-100 text-amber-700' :
                      selectedAccount.status === 'APROBADA' ? 'bg-green-100 text-green-700' :
                      'bg-emerald-100 text-emerald-700'
                    }`}>
                    {selectedAccount.status}
                  </div>
                </div>
              </div>
            </div>

            {/* Contenido Principal */}
            <div className="flex-1 overflow-y-auto p-8">
              
              {selectedAccount.status === 'BORRADOR' && (
                <div className="mb-8">
                  <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wider flex items-center gap-2">
                    <FileText size={16} className="text-indigo-600" /> Selector de Facturas (SUBIDAS)
                  </h3>
                  <div className="border border-gray-200 rounded-2xl bg-gray-50 p-6 text-center">
                    <p className="text-gray-500 text-sm mb-4">Selecciona facturas del pool de facturas subidas para vincular a esta cuenta de gastos.</p>
                    <button className="px-4 py-2 bg-white border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-indigo-50 hover:text-indigo-700 transition-colors shadow-sm text-sm inline-flex items-center gap-2">
                      <Plus size={16} /> Abrir Selector de Facturas
                    </button>
                  </div>
                </div>
              )}

              <div className="mb-8">
                <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wider">Facturas Vinculadas ({selectedAccount.vendorInvoiceIds.length})</h3>
                {selectedAccount.vendorInvoiceIds.length === 0 ? (
                  <div className="text-center p-8 bg-gray-50 rounded-2xl border border-gray-100 text-gray-400 text-sm">
                    No hay facturas vinculadas a esta cuenta.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Aquí iría el listado de facturas vinculadas */}
                    <p className="text-sm text-gray-500">Listado de facturas...</p>
                  </div>
                )}
              </div>
              
              {selectedAccount.status === 'APROBADA' && (
                <div className="mb-8 p-6 bg-indigo-50 border border-indigo-100 rounded-2xl">
                  <h3 className="text-sm font-bold text-indigo-900 mb-2 flex items-center gap-2">
                    <Upload size={16} /> Comprobante de Pago
                  </h3>
                  <p className="text-indigo-700 text-xs mb-4">Para marcar esta cuenta y sus facturas como PAGADAS, sube el comprobante de pago bancario (PDF).</p>
                  
                  <div className="border-2 border-dashed border-indigo-200 rounded-xl p-8 text-center bg-white hover:bg-indigo-50/50 cursor-pointer transition-colors">
                    <File className="h-8 w-8 text-indigo-300 mx-auto mb-2" />
                    <p className="text-sm font-medium text-indigo-600">Haz clic para subir o arrastra el PDF aquí</p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer / Acciones */}
            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
              <div className="flex gap-6">
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Total MXN</p>
                  <p className="text-xl font-bold text-gray-900">${selectedAccount.totalMXN.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Total USD</p>
                  <p className="text-xl font-bold text-gray-900">${selectedAccount.totalUSD.toLocaleString()}</p>
                </div>
              </div>
              
              <div className="flex gap-3">
                {selectedAccount.status === 'BORRADOR' && (
                  <button className="px-6 py-3 bg-indigo-600 text-white font-medium text-sm rounded-xl hover:bg-indigo-700 transition-colors shadow-sm flex items-center gap-2">
                    Promover a En Revisión <Check size={16} />
                  </button>
                )}
                {selectedAccount.status === 'EN_REVISION' && (
                  <>
                    <button className="px-4 py-3 bg-white border border-gray-200 text-red-600 font-medium text-sm rounded-xl hover:bg-red-50 transition-colors shadow-sm flex items-center gap-2">
                      <X size={16} /> Rechazar
                    </button>
                    <button className="px-6 py-3 bg-emerald-600 text-white font-medium text-sm rounded-xl hover:bg-emerald-700 transition-colors shadow-sm flex items-center gap-2">
                      <CheckCircle size={16} /> Aprobar Cuenta
                    </button>
                  </>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <FolderOpen className="h-16 w-16 text-gray-200 mb-4" />
            <p className="text-lg font-medium text-gray-900 mb-1">Ninguna cuenta seleccionada</p>
            <p className="text-sm">Selecciona una cuenta de la lista o crea una nueva.</p>
          </div>
        )}
      </div>
    </div>
  );
}
