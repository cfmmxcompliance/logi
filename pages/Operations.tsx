import React, { useState, useEffect, useRef } from 'react';
import { storageService } from '../services/storageService.ts';
import { Shipment, ShipmentStatus, UserRole } from '../types.ts';
import { Plus, Search, FileDown, FileSpreadsheet, X, Save, Edit2, Trash2, AlertTriangle } from 'lucide-react';
import { parseCSV } from '../utils/csvHelpers.ts';
import { ProcessingModal, ProcessingState, INITIAL_PROCESSING_STATE } from '../components/ProcessingModal.tsx';
import { useAuth } from '../context/AuthContext.tsx';

const shipmentEmptyState: Shipment = {
  id: '',
  status: ShipmentStatus.PLANNED,
  costs: 0,
  origin: '',
  destination: '',
  projectSection: '',
  shipmentBatch: '',
  personInCharge: '',
  locationOfGoods: '',
  cargoReadyDate: '',
  containerTypeQty: '',
  submissionDeadline: '',
  submissionStatus: '',
  bpmShipmentNo: '',
  carrier: '',
  portTerminal: '',
  forwarderId: '',
  blNo: '',
  etd: '',
  atd: '',
  eta: '',
  ata: '',
  ataCfm: '',
  reference: '',
  containers: []
};

// CSV Column mapping
const SHIPMENT_CSV_KEYS: (keyof Shipment)[] = [
    'projectSection', 'shipmentBatch', 'status', 'personInCharge', 'locationOfGoods',
    'cargoReadyDate', 'containerTypeQty', 'submissionDeadline', 'submissionStatus',
    'bpmShipmentNo', 'carrier', 'portTerminal', 'forwarderId', 'blNo', 
    'etd', 'atd', 'eta', 'ata', 'ataCfm'
];

export const Operations = () => {
  const { hasRole } = useAuth();
  const isAdmin = hasRole([UserRole.ADMIN]);

  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [filter, setFilter] = useState('');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentShipment, setCurrentShipment] = useState<Shipment>(shipmentEmptyState);
  const [deleteModal, setDeleteModal] = useState<{isOpen: boolean, id: string | null}>({isOpen: false, id: null});
  
  // Processing State
  const [procState, setProcState] = useState<ProcessingState>(INITIAL_PROCESSING_STATE);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setShipments(storageService.getShipments());
    const unsub = storageService.subscribe(() => {
        setShipments([...storageService.getShipments()]);
    });
    return unsub;
  }, []);

  const getStatusColor = (status: ShipmentStatus) => {
    switch (status) {
      case ShipmentStatus.PLANNED: return 'bg-slate-100 text-slate-600';
      case ShipmentStatus.IN_TRANSIT: return 'bg-blue-100 text-blue-700';
      case ShipmentStatus.CUSTOMS: return 'bg-amber-100 text-amber-700';
      case ShipmentStatus.DELIVERED: return 'bg-emerald-100 text-emerald-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const filteredShipments = shipments.filter(s => {
      if (!filter) return true;
      const lowerFilter = filter.toLowerCase();
      return Object.values(s).some(val => 
          val && typeof val !== 'object' && String(val).toLowerCase().includes(lowerFilter)
      );
  });

  const handleEdit = (s: Shipment) => {
      setCurrentShipment(s);
      setIsModalOpen(true);
  };

  const handleCreate = () => {
      setCurrentShipment(shipmentEmptyState);
      setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
      e.preventDefault();
      await storageService.updateShipment(currentShipment);
      setIsModalOpen(false);
  };

  const initiateDelete = (id: string) => {
      setDeleteModal({ isOpen: true, id });
  };

  const confirmDelete = async () => {
      if (!isAdmin || !deleteModal.id) return;
      try {
          await storageService.deleteShipment(deleteModal.id);
          setDeleteModal({ isOpen: false, id: null });
      } catch (e) {
          alert('Error eliminando el registro.');
      }
  };
  
  const handleDownloadTemplate = () => {
      const headerRow = SHIPMENT_CSV_KEYS.join(',');
      const exampleRow = SHIPMENT_CSV_KEYS.map(key => {
          if (key === 'status') return 'In Transit';
          if (key.toLowerCase().includes('date') || key.includes('etd') || key.includes('eta')) return '2024-01-01';
          return `Sample ${key}`;
      }).join(',');
      const csvContent = headerRow + '\n' + exampleRow;
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'shipment_plan_template.csv';
      link.click();
  };

  const handleBulkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setProcState({
          isOpen: true,
          status: 'loading',
          title: 'Reading File',
          message: 'Parsing CSV...',
          progress: 10
      });

      const reader = new FileReader();
      reader.onload = async (evt) => {
          try {
              const text = evt.target?.result as string;
              if (!text) throw new Error("Empty file");
              
              const rows = parseCSV(text);
              if (rows.length < 2) throw new Error("Invalid CSV format");

              // Simple Header Matching based on SHIPMENT_CSV_KEYS
              const headers = rows[0].map(h => h.trim());
              const mapIndices: Record<string, number> = {};
              
              SHIPMENT_CSV_KEYS.forEach(key => {
                  const idx = headers.findIndex(h => h.toLowerCase() === key.toLowerCase());
                  if (idx !== -1) mapIndices[key] = idx;
              });

              setProcState(prev => ({ ...prev, progress: 30, message: 'Processing rows...' }));
              
              const newShipments: Shipment[] = [];
              for(let i = 1; i < rows.length; i++) {
                  const row = rows[i];
                  if (row.length < 2) continue;
                  
                  const newItem: any = { ...shipmentEmptyState };
                  let hasData = false;
                  
                  SHIPMENT_CSV_KEYS.forEach(key => {
                      const idx = mapIndices[key];
                      if (idx !== undefined && row[idx]) {
                          newItem[key] = row[idx].trim();
                          hasData = true;
                      }
                  });
                  
                  if (hasData) newShipments.push(newItem);
              }
              
              if (newShipments.length === 0) throw new Error("No valid data found");

              setProcState(prev => ({ ...prev, progress: 60, message: 'Saving...' }));
              
              await storageService.upsertShipments(newShipments, (p) => {
                   setProcState(prev => ({ ...prev, progress: 60 + (p * 0.4) }));
              });
              
              setProcState({
                  isOpen: true,
                  status: 'success',
                  title: 'Success',
                  message: `Imported ${newShipments.length} records.`,
                  progress: 100
              });
              setTimeout(() => setProcState(INITIAL_PROCESSING_STATE), 2000);

          } catch (err: any) {
              setProcState({
                  isOpen: true,
                  status: 'error',
                  title: 'Error',
                  message: err.message,
                  progress: 0
              });
          } finally {
              if (fileInputRef.current) fileInputRef.current.value = '';
          }
      };
      reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      <ProcessingModal state={procState} onClose={() => setProcState(INITIAL_PROCESSING_STATE)} />
      
      <div className="flex justify-between items-center">
        <div>
            <h1 className="text-2xl font-bold text-slate-800">Shipment Plan (Operations)</h1>
            <p className="text-slate-500 text-sm">Overview of all active bookings and statuses.</p>
        </div>
        <div className="flex gap-2">
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleBulkUpload} 
                onClick={(e) => (e.currentTarget.value = '')}
                accept=".csv" 
                className="hidden" 
            />
            <button 
                onClick={handleDownloadTemplate}
                className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm hover:bg-slate-50 transition-all"
            >
                <FileSpreadsheet size={18} /> Template
            </button>
            <button 
                onClick={() => fileInputRef.current?.click()}
                className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm hover:bg-slate-50 transition-all"
            >
                <FileDown size={18} /> Import CSV
            </button>
            <button 
                onClick={handleCreate}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-all"
            >
                <Plus size={18} /> New Shipment
            </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="relative">
          <Search className="absolute left-3 top-3 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Search Project, Batch, BPM No, Container..." 
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>

      {/* Operations Table - Horizontal Scroll */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[calc(100vh-250px)]">
         <div className="overflow-auto flex-1">
             <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-50 text-slate-600 font-bold sticky top-0 z-10 shadow-sm whitespace-nowrap">
                    <tr>
                        <th className="px-3 py-3 border-b border-r border-slate-200 bg-slate-50 sticky left-0 z-20">Action</th>
                        <th className="px-3 py-3 border-b border-r border-slate-200">Project Section</th>
                        <th className="px-3 py-3 border-b border-r border-slate-200">Shipment Batch</th>
                        <th className="px-3 py-3 border-b border-r border-slate-200">Status</th>
                        <th className="px-3 py-3 border-b border-r border-slate-200">Person In Charge</th>
                        <th className="px-3 py-3 border-b border-r border-slate-200">Location of Goods</th>
                        <th className="px-3 py-3 border-b border-r border-slate-200">Ready Date</th>
                        <th className="px-3 py-3 border-b border-r border-slate-200">Container Type/Qty</th>
                        <th className="px-3 py-3 border-b border-r border-slate-200">List Deadline</th>
                        <th className="px-3 py-3 border-b border-r border-slate-200">List Status</th>
                        <th className="px-3 py-3 border-b border-r border-slate-200">BPM Shipment No</th>
                        <th className="px-3 py-3 border-b border-r border-slate-200">Carrier / Agent</th>
                        <th className="px-3 py-3 border-b border-r border-slate-200">Port / Terminal</th>
                        <th className="px-3 py-3 border-b border-r border-slate-200">Forwarder</th>
                        <th className="px-3 py-3 border-b border-r border-slate-200">BL No.</th>
                        <th className="px-3 py-3 border-b border-r border-slate-200">ETD</th>
                        <th className="px-3 py-3 border-b border-r border-slate-200">ATD</th>
                        <th className="px-3 py-3 border-b border-r border-slate-200">ETA</th>
                        <th className="px-3 py-3 border-b border-r border-slate-200">ATA</th>
                        <th className="px-3 py-3 border-b border-slate-200">ATA CFM</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 whitespace-nowrap">
                    {filteredShipments.map((shipment) => (
                        <tr key={shipment.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-3 py-2 border-r border-slate-100 sticky left-0 bg-white hover:bg-slate-50 flex items-center gap-2">
                                <button onClick={() => handleEdit(shipment)} className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50"><Edit2 size={14}/></button>
                                {isAdmin && (
                                    <button onClick={() => initiateDelete(shipment.id)} className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50">
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </td>
                            <td className="px-3 py-2 border-r border-slate-100 font-medium">{shipment.projectSection || '-'}</td>
                            <td className="px-3 py-2 border-r border-slate-100 text-blue-600 font-mono">{shipment.shipmentBatch || '-'}</td>
                            <td className="px-3 py-2 border-r border-slate-100">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold ${getStatusColor(shipment.status)}`}>
                                    {shipment.status}
                                </span>
                            </td>
                            <td className="px-3 py-2 border-r border-slate-100">{shipment.personInCharge || '-'}</td>
                            <td className="px-3 py-2 border-r border-slate-100">{shipment.locationOfGoods || shipment.origin || '-'}</td>
                            <td className="px-3 py-2 border-r border-slate-100">{shipment.cargoReadyDate || '-'}</td>
                            <td className="px-3 py-2 border-r border-slate-100">{shipment.containerTypeQty || '-'}</td>
                            <td className="px-3 py-2 border-r border-slate-100 text-amber-600">{shipment.submissionDeadline || '-'}</td>
                            <td className="px-3 py-2 border-r border-slate-100">{shipment.submissionStatus || '-'}</td>
                            <td className="px-3 py-2 border-r border-slate-100 font-mono text-slate-500">{shipment.bpmShipmentNo || '-'}</td>
                            <td className="px-3 py-2 border-r border-slate-100">{shipment.carrier || '-'}</td>
                            <td className="px-3 py-2 border-r border-slate-100">{shipment.portTerminal || '-'}</td>
                            <td className="px-3 py-2 border-r border-slate-100">{shipment.forwarderId || '-'}</td>
                            <td className="px-3 py-2 border-r border-slate-100 font-bold">{shipment.blNo || shipment.reference || '-'}</td>
                            <td className="px-3 py-2 border-r border-slate-100">{shipment.etd || '-'}</td>
                            <td className="px-3 py-2 border-r border-slate-100">{shipment.atd || '-'}</td>
                            <td className="px-3 py-2 border-r border-slate-100">{shipment.eta || '-'}</td>
                            <td className="px-3 py-2 border-r border-slate-100">{shipment.ata || '-'}</td>
                            <td className="px-3 py-2 border-slate-100">{shipment.ataCfm || '-'}</td>
                        </tr>
                    ))}
                    {filteredShipments.length === 0 && (
                        <tr>
                            <td colSpan={20} className="p-8 text-center text-slate-400">
                                No shipments found matching your criteria.
                            </td>
                        </tr>
                    )}
                </tbody>
             </table>
         </div>
      </div>

      {deleteModal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
                  <div className="bg-red-50 p-6 flex flex-col items-center text-center border-b border-red-100">
                      <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-3">
                          <AlertTriangle size={24} />
                      </div>
                      <h3 className="text-lg font-bold text-red-900">Confirm Deletion</h3>
                  </div>
                  <div className="p-6 flex gap-3">
                      <button onClick={() => setDeleteModal({isOpen: false, id: null})} className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium">Cancel</button>
                      <button onClick={confirmDelete} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium shadow-sm">Confirm</button>
                  </div>
              </div>
          </div>
      )}

      {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
                  <div className="flex justify-between items-center p-6 border-b border-slate-100">
                      <h2 className="text-xl font-bold text-slate-800">
                          {currentShipment.id ? 'Edit Shipment' : 'New Shipment'}
                      </h2>
                      <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
                  </div>
                  <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {SHIPMENT_CSV_KEYS.map(key => (
                              <label key={key} className="block">
                                  <span className="text-xs font-bold text-slate-500 uppercase">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                                  <input 
                                    className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 text-sm"
                                    value={(currentShipment as any)[key]}
                                    onChange={e => setCurrentShipment({...currentShipment, [key]: e.target.value})}
                                  />
                              </label>
                          ))}
                      </div>
                  </form>
                  <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 rounded-b-xl">
                      <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium">Cancel</button>
                      <button onClick={handleSave} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm flex items-center gap-2">
                          <Save size={18} /> Save
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};