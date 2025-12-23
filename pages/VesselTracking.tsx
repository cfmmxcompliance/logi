import React, { useState, useEffect, useRef } from 'react';
import { storageService } from '../services/storageService.ts';
import { VesselTrackingRecord, UserRole } from '../types.ts';
import { Plus, Search, FileDown, Anchor, FileSpreadsheet, Edit2, X, Save, Trash2, AlertTriangle, Plane } from 'lucide-react';
import { parseCSV } from '../utils/csvHelpers.ts';
import { ProcessingModal, ProcessingState, INITIAL_PROCESSING_STATE } from '../components/ProcessingModal.tsx';
import { useAuth } from '../context/AuthContext.tsx';

const vesselEmptyState: VesselTrackingRecord = {
    id: '',
    refNo: '',
    modelCode: '',
    qty: 0,
    projectType: '',
    contractNo: '',
    invoiceNo: '',
    shippingCompany: '',
    terminal: '',
    blNo: '',
    containerNo: '',
    containerSize: '',
    etd: '',
    etaPort: '',
    preAlertDate: '',
    atd: '',
    ataPort: ''
};

const VESSEL_CSV_KEYS: (keyof VesselTrackingRecord)[] = [
    'refNo', 'modelCode', 'qty', 'projectType', 'contractNo', 'invoiceNo', 
    'shippingCompany', 'terminal', 'blNo', 'containerNo', 'containerSize', 
    'etd', 'etaPort', 'preAlertDate', 'atd', 'ataPort'
];

export const VesselTracking = () => {
  const { hasRole } = useAuth();
  const isAdmin = hasRole([UserRole.ADMIN]);

  const [records, setRecords] = useState<VesselTrackingRecord[]>([]);
  const [filter, setFilter] = useState('');
  const [activeTab, setActiveTab] = useState<'ALL' | 'SEA' | 'AIR'>('ALL');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentRecord, setCurrentRecord] = useState<VesselTrackingRecord>(vesselEmptyState);
  const [deleteModal, setDeleteModal] = useState<{isOpen: boolean, id: string | null}>({isOpen: false, id: null});

  // Processing State
  const [procState, setProcState] = useState<ProcessingState>(INITIAL_PROCESSING_STATE);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecords(storageService.getVesselTracking());
    const unsub = storageService.subscribe(() => {
        setRecords([...storageService.getVesselTracking()]);
    });
    return unsub;
  }, []);

  const isAir = (r: VesselTrackingRecord) => {
      // Heuristic to determine if it is Air Freight
      return (
          r.projectType?.toLowerCase().includes('air') || 
          r.containerSize?.toLowerCase() === 'air' ||
          r.containerNo?.includes('AIR CARGO')
      );
  };

  const filteredRecords = records.filter(r => {
      // 1. Tab Filter
      if (activeTab === 'AIR' && !isAir(r)) return false;
      if (activeTab === 'SEA' && isAir(r)) return false;

      // 2. Search Filter
      if (!filter) return true;
      const lowerFilter = filter.toLowerCase();
      return Object.values(r).some(val => 
          val && typeof val !== 'object' && String(val).toLowerCase().includes(lowerFilter)
      );
  });

  const handleEdit = (r: VesselTrackingRecord) => {
      setCurrentRecord(r);
      setIsModalOpen(true);
  };
  
  const handleCreate = () => {
      setCurrentRecord(vesselEmptyState);
      setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
      e.preventDefault();
      await storageService.updateVesselTracking(currentRecord);
      setIsModalOpen(false);
  };

  const initiateDelete = (id: string) => {
      setDeleteModal({ isOpen: true, id });
  };

  const confirmDelete = async () => {
      if (!isAdmin || !deleteModal.id) return;
      try {
          await storageService.deleteVesselTracking(deleteModal.id);
          setDeleteModal({ isOpen: false, id: null });
      } catch (e) {
          alert('Error eliminando el registro.');
      }
  };

  const handleExportFiltered = () => {
    if (filteredRecords.length === 0) {
        alert("No hay datos para exportar con los filtros actuales.");
        return;
    }

    // 1. Headers
    const headerRow = VESSEL_CSV_KEYS.join(',');

    // 2. Data Rows
    const dataRows = filteredRecords.map(record => {
        return VESSEL_CSV_KEYS.map(key => {
            let val = (record as any)[key];
            
            if (val === null || val === undefined) return '';
            
            // Escape CSV special characters
            const strVal = String(val);
            if (strVal.includes(',') || strVal.includes('"') || strVal.includes('\n')) {
                return `"${strVal.replace(/"/g, '""')}"`;
            }
            return strVal;
        }).join(',');
    });

    const csvContent = '\uFEFF' + [headerRow, ...dataRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    
    const timestamp = new Date().toISOString().slice(0,10);
    const filename = `vessel_tracking_export_${filter ? 'filtered_' : 'all_'}${timestamp}.csv`;

    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
  };

  const handleDownloadTemplate = () => {
      const headerRow = VESSEL_CSV_KEYS.join(',');
      const exampleRow = VESSEL_CSV_KEYS.map(key => {
          if (key === 'qty') return '10';
          if (key.toLowerCase().includes('date') || key.includes('etd') || key.includes('eta') || key.includes('atd') || key.includes('ata')) return '2024-01-01';
          return `Sample ${key}`;
      }).join(',');
      const csvContent = headerRow + '\n' + exampleRow;
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'vessel_tracking_template.csv';
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

              const headers = rows[0].map(h => h.trim());
              const mapIndices: Record<string, number> = {};
              
              VESSEL_CSV_KEYS.forEach(key => {
                  const idx = headers.findIndex(h => h.toLowerCase() === key.toLowerCase());
                  if (idx !== -1) mapIndices[key] = idx;
              });

              setProcState(prev => ({ ...prev, progress: 30, message: 'Processing rows...' }));
              
              const newRecords: VesselTrackingRecord[] = [];
              for(let i = 1; i < rows.length; i++) {
                  const row = rows[i];
                  if (row.length < 2) continue;
                  
                  const newItem: any = { ...vesselEmptyState };
                  let hasData = false;
                  
                  VESSEL_CSV_KEYS.forEach(key => {
                      const idx = mapIndices[key];
                      if (idx !== undefined && row[idx]) {
                          if (key === 'qty') newItem[key] = parseFloat(row[idx]) || 0;
                          else newItem[key] = row[idx].trim();
                          hasData = true;
                      }
                  });
                  
                  if (hasData) newRecords.push(newItem);
              }
              
              if (newRecords.length === 0) throw new Error("No valid data found");

              setProcState(prev => ({ ...prev, progress: 60, message: 'Saving...' }));
              
              await storageService.upsertVesselTracking(newRecords, (p) => {
                   setProcState(prev => ({ ...prev, progress: 60 + (p * 0.4) }));
              });
              
              setProcState({
                  isOpen: true,
                  status: 'success',
                  title: 'Success',
                  message: `Imported ${newRecords.length} records.`,
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

  const Th = ({ children, className }: { children?: React.ReactNode, className?: string }) => (
    <th className={`px-3 py-3 border-b border-r border-slate-200 bg-slate-50 text-slate-700 font-bold whitespace-pre-wrap ${className}`}>
        {children}
    </th>
  );

  const Td = ({ children, className }: { children?: React.ReactNode, className?: string }) => (
    <td className={`px-3 py-2 border-r border-slate-100 ${className}`}>
        {children || '-'}
    </td>
  );

  return (
    <div className="space-y-6">
      <ProcessingModal state={procState} onClose={() => setProcState(INITIAL_PROCESSING_STATE)} />

      <div className="flex justify-between items-center">
        <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Anchor className="text-blue-600" />
                Tracking
            </h1>
            <p className="text-slate-500 text-sm">Real-time status of vessels and maritime/air shipments.</p>
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
            {/* Export Button */}
             <button 
                onClick={handleExportFiltered}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-100 shadow-sm transition-colors"
                title="Export current table results to CSV"
            >
                <FileDown size={18} /> Export CSV
            </button>
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
                <Plus size={18} /> Add Record
            </button>
        </div>
      </div>

      {/* Tabs and Filters */}
      <div className="flex flex-col md:flex-row gap-4">
          <div className="bg-white rounded-lg p-1 border border-slate-200 shadow-sm inline-flex">
            <button 
                onClick={() => setActiveTab('ALL')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'ALL' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
                Todas
            </button>
            <button 
                onClick={() => setActiveTab('SEA')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'SEA' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
                <Anchor size={14}/> Marítimo
            </button>
            <button 
                onClick={() => setActiveTab('AIR')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'AIR' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
                <Plane size={14}/> Aéreo (DHL/FedEx)
            </button>
          </div>

          <div className="bg-white p-2 rounded-xl shadow-sm border border-slate-200 flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Search BL, Container, Invoice, or Vessel..." 
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
          </div>
      </div>

      {/* Tracking Table - Horizontal Scroll */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[calc(100vh-300px)]">
         <div className="overflow-auto flex-1">
             <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                    <tr>
                        <Th className="sticky left-0 z-20 w-16 bg-slate-50">Action</Th>
                        <Th className="sticky left-16 z-20 w-16">
                            Ref No.<br/>
                            <span className="text-[10px] text-slate-500 font-normal">序号</span>
                        </Th>
                        <Th className="min-w-[200px]">
                            Model code/Items Name<br/>
                            <span className="text-[10px] text-slate-500 font-normal">车型/项目</span>
                        </Th>
                        <Th>
                            Qty<br/>
                            <span className="text-[10px] text-slate-500 font-normal">数量</span>
                        </Th>
                        <Th>
                            Project types<br/>
                            <span className="text-[10px] text-slate-500 font-normal">Tipo de proyecto</span>
                        </Th>
                        <Th>
                            CF contract No.<br/>
                            <span className="text-[10px] text-slate-500 font-normal">CF 合同号</span>
                        </Th>
                        <Th>
                            CF Invoice No.<br/>
                            <span className="text-[10px] text-slate-500 font-normal">CF 发票号</span>
                        </Th>
                        <Th>
                            Shipping Company<br/>
                            <span className="text-[10px] text-slate-500 font-normal">Naviera / 船东</span>
                        </Th>
                        <Th>
                            Terminal<br/>
                            <span className="text-[10px] text-slate-500 font-normal">码头</span>
                        </Th>
                        <Th>
                            BL No.<br/>
                            <span className="text-[10px] text-slate-500 font-normal">提单号</span>
                        </Th>
                        <Th>
                            Container No.<br/>
                            <span className="text-[10px] text-slate-500 font-normal">集装箱号</span>
                        </Th>
                        <Th>
                            Container Size<br/>
                            <span className="text-[10px] text-slate-500 font-normal">集装箱尺寸</span>
                        </Th>
                        <Th>
                            ETD<br/>
                            <span className="text-[10px] text-slate-500 font-normal">预计开船日</span>
                        </Th>
                        <Th>
                            ETA Port<br/>
                            <span className="text-[10px] text-slate-500 font-normal">预计到港日</span>
                        </Th>
                        <Th>
                            Pre-Alert Date<br/>
                            <span className="text-[10px] text-slate-500 font-normal">到港通知及文件</span>
                        </Th>
                        <Th>
                            ATD<br/>
                            <span className="text-[10px] text-slate-500 font-normal">开船日</span>
                        </Th>
                        <Th className="border-r-0">
                            ATA Port<br/>
                            <span className="text-[10px] text-slate-500 font-normal">到港日</span>
                        </Th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 whitespace-nowrap">
                    {filteredRecords.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-3 py-2 border-r border-slate-100 sticky left-0 bg-white hover:bg-slate-50 flex items-center gap-2">
                                <button onClick={() => handleEdit(r)} className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50"><Edit2 size={14}/></button>
                                {isAdmin && (
                                    <button onClick={() => initiateDelete(r.id)} className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50">
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </td>
                            <td className="px-3 py-2 border-r border-slate-100 sticky left-16 bg-white hover:bg-slate-50 font-bold">{r.refNo}</td>
                            <Td className="font-medium text-slate-800">{r.modelCode}</Td>
                            <Td>{r.qty}</Td>
                            <Td>
                                {isAir(r) ? 
                                    <span className="flex items-center gap-1 text-purple-600 font-bold text-[10px]"><Plane size={10}/> {r.projectType || 'Air'}</span> : 
                                    <span className="text-slate-600">{r.projectType}</span>
                                }
                            </Td>
                            <Td className="font-mono text-slate-600">{r.contractNo}</Td>
                            <Td className="font-mono text-slate-600">{r.invoiceNo}</Td>
                            <Td>{r.shippingCompany}</Td>
                            <Td>{r.terminal}</Td>
                            <Td className="font-bold text-blue-600">{r.blNo}</Td>
                            <Td className="font-mono">{r.containerNo}</Td>
                            <Td>{r.containerSize}</Td>
                            <Td>{r.etd}</Td>
                            <Td>{r.etaPort}</Td>
                            <Td className="text-amber-600">{r.preAlertDate}</Td>
                            <Td>{r.atd}</Td>
                            <Td className="border-r-0">{r.ataPort}</Td>
                        </tr>
                    ))}
                    {filteredRecords.length === 0 && (
                        <tr>
                            <td colSpan={17} className="p-12 text-center text-slate-400">
                                <Anchor className="mx-auto mb-2 opacity-50" size={32} />
                                No vessel records found in this section.
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
                          {currentRecord.id ? 'Edit Vessel Record' : 'New Vessel Record'}
                      </h2>
                      <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
                  </div>
                  <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {VESSEL_CSV_KEYS.map(key => (
                              <label key={key} className="block">
                                  <span className="text-xs font-bold text-slate-500 uppercase">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                                  <input 
                                    className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 text-sm"
                                    type={key === 'qty' ? 'number' : 'text'}
                                    value={(currentRecord as any)[key]}
                                    onChange={e => setCurrentRecord({...currentRecord, [key]: key === 'qty' ? parseFloat(e.target.value) : e.target.value})}
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