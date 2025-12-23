import React, { useState, useEffect, useRef } from 'react';
import { storageService } from '../services/storageService.ts';
import { geminiService } from '../services/geminiService.ts';
import { PreAlertRecord, UserRole } from '../types.ts';
import { Plus, Search, FileDown, Bell, FileSpreadsheet, Edit2, X, Save, Trash2, AlertTriangle, Upload, FileText, CheckCircle, Plane, Anchor, Container, RefreshCw } from 'lucide-react';
import { parseCSV } from '../utils/csvHelpers.ts';
import { ProcessingModal, ProcessingState, INITIAL_PROCESSING_STATE } from '../components/ProcessingModal.tsx';
import { useAuth } from '../context/AuthContext.tsx';

// Initialize Empty State
const preAlertEmptyState: PreAlertRecord = {
    id: '',
    model: '',
    shippingMode: 'SEA',
    bookingAbw: '',
    etd: '',
    atd: '',
    departureCity: '',
    eta: '',
    ata: '',
    ataFactory: '',
    arrivalCity: '',
    invoiceNo: '',
    processed: false
};

// Keys for form generation (and CSV)
const PREALERT_KEYS: (keyof PreAlertRecord)[] = [
    'model', 'shippingMode', 'bookingAbw', 'etd', 'atd', 'departureCity', 'eta', 'ata', 'ataFactory', 'arrivalCity', 'invoiceNo'
];

interface ExtractionReview {
    preAlert: PreAlertRecord;
    containers: {containerNo: string, size: string}[];
}

export const PreAlerts = () => {
  const { hasRole } = useAuth();
  const isAdmin = hasRole([UserRole.ADMIN]);

  const [records, setRecords] = useState<PreAlertRecord[]>([]);
  const [filter, setFilter] = useState('');
  const [activeTab, setActiveTab] = useState<'ALL' | 'SEA' | 'AIR'>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentRecord, setCurrentRecord] = useState<PreAlertRecord>(preAlertEmptyState);
  const [deleteModal, setDeleteModal] = useState<{isOpen: boolean, id: string | null}>({isOpen: false, id: null});

  // Processing & Review State
  const [procState, setProcState] = useState<ProcessingState>(INITIAL_PROCESSING_STATE);
  const [extractionReview, setExtractionReview] = useState<ExtractionReview | null>(null);
  const [includeEquipment, setIncludeEquipment] = useState(true);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecords(storageService.getPreAlerts());
    const unsub = storageService.subscribe(() => {
        setRecords([...storageService.getPreAlerts()]);
    });
    return unsub;
  }, []);

  const filteredRecords = records.filter(r => {
      // 1. Filter by Tab (Mode)
      if (activeTab !== 'ALL' && r.shippingMode !== activeTab) return false;

      // 2. Filter by Search Text
      if (!filter) return true;
      const lowerFilter = filter.toLowerCase();
      return Object.values(r).some(val => 
          val && typeof val !== 'object' && String(val).toLowerCase().includes(lowerFilter)
      );
  });

  const handleEdit = (r: PreAlertRecord) => {
      setCurrentRecord(r);
      setIsModalOpen(true);
  };

  const handleCreate = () => {
      setCurrentRecord(preAlertEmptyState);
      setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
      e.preventDefault();
      await storageService.updatePreAlert(currentRecord);
      setIsModalOpen(false);
  };

  const initiateDelete = (id: string) => {
      setDeleteModal({ isOpen: true, id });
  };

  const confirmDelete = async () => {
      if (!isAdmin || !deleteModal.id) return;
      try {
          await storageService.deletePreAlert(deleteModal.id);
          setDeleteModal({ isOpen: false, id: null });
      } catch (e) {
          alert('Error eliminando el registro.');
      }
  };

  const handleSyncDates = async (record: PreAlertRecord) => {
      if (!window.confirm("¿Sincronizar fechas?\n\nEsto actualizará las fechas (ETD, ATD, ETA, ATA, ATA Factory) en los registros correspondientes de Tracking, Equipment y Customs.")) {
          return;
      }
      setProcState({
          isOpen: true,
          status: 'loading',
          title: 'Syncing Dates',
          message: 'Updating related modules...',
          progress: 50
      });
      try {
          await storageService.syncPreAlertDates(record);
          setProcState({
              isOpen: true,
              status: 'success',
              title: 'Synced',
              message: 'Dates updated successfully.',
              progress: 100
          });
          setTimeout(() => setProcState(INITIAL_PROCESSING_STATE), 1500);
      } catch (e: any) {
          setProcState({
              isOpen: true,
              status: 'error',
              title: 'Sync Failed',
              message: e.message || "Unknown error",
              progress: 0
          });
      }
  };

  const handleExportFiltered = () => {
    if (filteredRecords.length === 0) {
        alert("No hay datos para exportar con los filtros actuales.");
        return;
    }

    // 1. Headers
    const headerRow = PREALERT_KEYS.join(',');

    // 2. Data Rows
    const dataRows = filteredRecords.map(record => {
        return PREALERT_KEYS.map(key => {
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
    const filename = `pre_alerts_export_${filter ? 'filtered_' : 'all_'}${timestamp}.csv`;

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
      const headerRow = PREALERT_KEYS.join(',');
      const exampleRow = "CFORCE 600,SEA,COSU12345678,2024-05-01,2024-05-02,Shanghai,2024-06-15,,,Manzanillo,INV-2024-001";
      const csvContent = headerRow + '\n' + exampleRow;
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'pre_alert_template.csv';
      link.click();
  };

  // CSV Import Logic
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
              
              PREALERT_KEYS.forEach(key => {
                  const idx = headers.findIndex(h => h.toLowerCase() === key.toLowerCase());
                  if (idx !== -1) mapIndices[key] = idx;
              });

              setProcState(prev => ({ ...prev, progress: 30, message: 'Processing rows...' }));
              
              const newRecords: PreAlertRecord[] = [];
              for(let i = 1; i < rows.length; i++) {
                  const row = rows[i];
                  if (row.length < 2) continue;
                  
                  const newItem: any = { ...preAlertEmptyState };
                  let hasData = false;
                  
                  PREALERT_KEYS.forEach(key => {
                      const idx = mapIndices[key];
                      if (idx !== undefined && row[idx]) {
                          newItem[key] = row[idx].trim();
                          hasData = true;
                      }
                  });
                  
                  if (hasData) newRecords.push(newItem);
              }
              
              setProcState(prev => ({ ...prev, progress: 60, message: 'Saving...' }));
              
              await storageService.upsertPreAlerts(newRecords, (p) => {
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

  // AI Document Upload Logic (BL / AWB) - STEP 1: Analysis
  const handleDocUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // 4MB limit
      if (file.size > 4 * 1024 * 1024) {
          alert("File is too large. Please upload an image or PDF smaller than 4MB.");
          return;
      }

      const fileType = file.type || 'image/jpeg';

      setProcState({
          isOpen: true,
          status: 'loading',
          title: 'Analyzing Document',
          message: 'Extracting data with AI (Gemini)...',
          progress: 10
      });

      const reader = new FileReader();
      reader.onloadend = async () => {
          const base64 = (reader.result as string).split(',')[1];
          try {
              // 1. Extract Data
              const extracted = await geminiService.parseShippingDocument(base64, fileType);
              
              // 2. Prepare Data for Review
              const newPreAlert: PreAlertRecord = {
                  id: '', // Generated by service
                  model: extracted.model || 'Unknown Model (Update manually)', 
                  shippingMode: extracted.docType === 'AWB' ? 'AIR' : 'SEA',
                  bookingAbw: extracted.bookingNo,
                  etd: extracted.etd,
                  departureCity: extracted.departurePort,
                  eta: extracted.eta,
                  arrivalCity: extracted.arrivalPort,
                  invoiceNo: extracted.invoiceNo || extracted.poNumber || '', 
                  processed: true,
                  linkedContainers: extracted.containers.map(c => c.containerNo)
              };

              // Close Processing Modal and Open Review Modal
              setProcState(INITIAL_PROCESSING_STATE);
              setExtractionReview({
                  preAlert: newPreAlert,
                  containers: extracted.containers
              });
              setIncludeEquipment(true); // Default to true

          } catch (err: any) {
              console.error(err);
              setProcState({
                  isOpen: true,
                  status: 'error',
                  title: 'AI Processing Failed',
                  message: err.message || "Unknown error occurred",
                  progress: 0
              });
          } finally {
              if (docInputRef.current) docInputRef.current.value = '';
          }
      };
      reader.readAsDataURL(file);
  };

  // Step 2: Confirmation & Save
  const handleConfirmExtraction = async () => {
      if (!extractionReview) return;

      setExtractionReview(null);
      setProcState({
          isOpen: true,
          status: 'loading',
          title: 'Saving Records',
          message: 'Distributing data to modules...',
          progress: 60
      });

      try {
          await storageService.processPreAlertExtraction(
              extractionReview.preAlert, 
              extractionReview.containers,
              includeEquipment // Pass user choice
          );

          setProcState({
              isOpen: true,
              status: 'success',
              title: 'Processing Complete',
              message: `Processed ${extractionReview.preAlert.shippingMode} shipment. ${!includeEquipment ? '(Equipment skipped)' : ''}`,
              progress: 100
          });
          
          setTimeout(() => setProcState(INITIAL_PROCESSING_STATE), 2000);

      } catch (err: any) {
          setProcState({
              isOpen: true,
              status: 'error',
              title: 'Save Failed',
              message: err.message,
              progress: 0
          });
      }
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

      {/* Review Extraction Modal */}
      {extractionReview && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
                  <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
                      <div className="bg-blue-100 p-2 rounded-full text-blue-600">
                          <CheckCircle size={24} />
                      </div>
                      <div>
                          <h3 className="text-lg font-bold text-slate-800">Review Extraction</h3>
                          <p className="text-sm text-slate-500">Confirm data before generating records.</p>
                      </div>
                  </div>
                  
                  <div className="p-6 space-y-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                              <span className="block text-slate-400 text-xs uppercase font-bold">Booking / AWB</span>
                              <span className="font-mono font-medium text-slate-800">{extractionReview.preAlert.bookingAbw}</span>
                          </div>
                          <div>
                              <span className="block text-slate-400 text-xs uppercase font-bold">Mode</span>
                              <span className="font-medium text-blue-600 flex items-center gap-1">
                                  {extractionReview.preAlert.shippingMode === 'AIR' ? <Plane size={14}/> : <Anchor size={14}/>}
                                  {extractionReview.preAlert.shippingMode}
                              </span>
                          </div>
                          <div>
                              <span className="block text-slate-400 text-xs uppercase font-bold">Containers Detected</span>
                              <span className="font-medium text-slate-800">{extractionReview.containers.length > 0 ? extractionReview.containers.length : 'None (Bulk/Air)'}</span>
                          </div>
                          <div>
                              <span className="block text-slate-400 text-xs uppercase font-bold">ETA</span>
                              <span className="font-medium text-slate-800">{extractionReview.preAlert.eta || 'N/A'}</span>
                          </div>
                      </div>

                      <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-100">
                          <label className="flex items-start gap-3 cursor-pointer">
                              <input 
                                  type="checkbox" 
                                  className="mt-1 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                                  checked={includeEquipment}
                                  onChange={(e) => setIncludeEquipment(e.target.checked)}
                              />
                              <div>
                                  <span className="font-bold text-slate-800 text-sm">Generar Equipment Tracking?</span>
                                  <p className="text-xs text-slate-600 mt-1">
                                      Si se marca, se crearán registros en la tabla de <strong>Equipment Tracking</strong> automáticamente. 
                                      Si no, solo se llenará <strong>Vessel Tracking</strong> y <strong>Customs</strong>.
                                  </p>
                              </div>
                          </label>
                      </div>
                  </div>

                  <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
                      <button 
                          onClick={() => setExtractionReview(null)} 
                          className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-white font-medium transition-colors"
                      >
                          Cancel
                      </button>
                      <button 
                          onClick={handleConfirmExtraction} 
                          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm transition-colors flex items-center justify-center gap-2"
                      >
                          <Save size={18} /> Confirm & Save
                      </button>
                  </div>
              </div>
          </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Bell className="text-blue-600" />
                Pre-Alertas
            </h1>
            <p className="text-slate-500 text-sm">Central ingestion for Maritime (BL) and Air (AWB) shipments.</p>
        </div>
        <div className="flex flex-wrap gap-2">
            <input 
                type="file" 
                ref={docInputRef} 
                onChange={handleDocUpload} 
                onClick={(e) => (e.currentTarget.value = '')}
                accept="image/*,.pdf" 
                className="hidden" 
            />
             <button 
                onClick={() => docInputRef.current?.click()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-all"
                title="Upload BL or AWB to automatically populate all tables"
            >
                <FileText size={18} /> Process BL/AWB (AI)
            </button>
            <div className="w-px bg-slate-300 mx-1"></div>
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
                placeholder="Search Booking, Model, Invoice..." 
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
          </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[calc(100vh-300px)]">
         <div className="overflow-auto flex-1">
             <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                    <tr>
                        <Th className="sticky left-0 z-20 w-16 bg-slate-50">Action</Th>
                        <Th className="sticky left-16 z-20">Booking / AWB</Th>
                        <Th>Mode</Th>
                        <Th>Model</Th>
                        <Th>ETD</Th>
                        <Th>Departure City</Th>
                        <Th>ETA</Th>
                        <Th>Arrival City</Th>
                        <Th>Invoice No</Th>
                        <Th className="border-r-0">Status</Th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 whitespace-nowrap">
                    {filteredRecords.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-3 py-2 border-r border-slate-100 sticky left-0 bg-white hover:bg-slate-50 flex items-center gap-2">
                                <button onClick={() => handleEdit(r)} className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50"><Edit2 size={14}/></button>
                                <button onClick={() => handleSyncDates(r)} className="text-emerald-600 hover:text-emerald-800 p-1 rounded hover:bg-emerald-50" title="Sync dates to Tracking/Customs">
                                    <RefreshCw size={14} />
                                </button>
                                {isAdmin && (
                                    <button onClick={() => initiateDelete(r.id)} className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50">
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </td>
                            <td className="px-3 py-2 border-r border-slate-100 sticky left-16 bg-white hover:bg-slate-50 font-bold text-blue-600">{r.bookingAbw}</td>
                            <Td>
                                {r.shippingMode === 'AIR' ? 
                                    <span className="flex items-center gap-1 text-purple-600 font-bold"><Plane size={12}/> Air</span> : 
                                    <span className="flex items-center gap-1 text-blue-600"><Anchor size={12}/> Sea</span>
                                }
                            </Td>
                            <Td>{r.model}</Td>
                            <Td>{r.etd}</Td>
                            <Td>{r.departureCity}</Td>
                            <Td>{r.eta}</Td>
                            <Td>{r.arrivalCity}</Td>
                            <Td>{r.invoiceNo}</Td>
                            <Td className="border-r-0">
                                {r.processed ? 
                                    <span className="flex items-center gap-1 text-emerald-600 font-medium"><CheckCircle size={12}/> Processed</span> :
                                    <span className="text-slate-400">Draft</span>
                                }
                            </Td>
                        </tr>
                    ))}
                    {filteredRecords.length === 0 && (
                        <tr>
                            <td colSpan={10} className="p-12 text-center text-slate-400">
                                <Bell className="mx-auto mb-2 opacity-50" size={32} />
                                No Pre-Alerts found in this section.
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
                          {currentRecord.id ? 'Edit Pre-Alert' : 'New Pre-Alert'}
                      </h2>
                      <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
                  </div>
                  <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {PREALERT_KEYS.map(key => (
                              <label key={key} className="block">
                                  <span className="text-xs font-bold text-slate-500 uppercase">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                                  {key === 'shippingMode' ? (
                                      <select
                                          className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 text-sm"
                                          value={(currentRecord as any)[key]}
                                          onChange={e => setCurrentRecord({...currentRecord, [key]: e.target.value as any})}
                                      >
                                          <option value="SEA">Sea</option>
                                          <option value="AIR">Air</option>
                                      </select>
                                  ) : (
                                    <input 
                                        className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 text-sm"
                                        type="text"
                                        value={(currentRecord as any)[key] || ''}
                                        placeholder={key.includes('Date') || key === 'etd' || key === 'eta' || key === 'atd' || key === 'ata' ? 'YYYY-MM-DD' : ''}
                                        onChange={e => setCurrentRecord({...currentRecord, [key]: e.target.value})}
                                    />
                                  )}
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