import React, { useState, useRef, useEffect, useMemo } from 'react';
import { storageService } from '../services/storageService.ts';
import { Upload, FileSpreadsheet, Search, Filter, DollarSign, Container, Clock, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { parseCSV } from '../utils/csvHelpers.ts';
import { ProcessingModal, ProcessingState, INITIAL_PROCESSING_STATE } from '../components/ProcessingModal.tsx';

export const Reports = () => {
  const [data, setData] = useState<any[]>(storageService.getLogistics());
  const [filterText, setFilterText] = useState('');
  
  // Modal State
  const [procState, setProcState] = useState<ProcessingState>(INITIAL_PROCESSING_STATE);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Initial sync
    setData(storageService.getLogistics());

    const unsub = storageService.subscribe(() => {
        setData(storageService.getLogistics());
    });
    return unsub;
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProcState({
        isOpen: true,
        status: 'loading',
        title: 'Uploading Report',
        message: 'Reading file...',
        progress: 10
    });

    const reader = new FileReader();
    reader.onload = async (evt) => {
        setTimeout(async () => {
            try {
                const text = evt.target?.result as string;
                if (!text) throw new Error("Empty file");

                setProcState(prev => ({ ...prev, progress: 30, message: 'Parsing CSV...' }));
                
                const rows = parseCSV(text);
                
                if (rows.length < 2) throw new Error("Invalid File. CSV must contain at least headers and one row of data.");

                // Standard parsing: Row 0 is headers
                const rawHeaders = rows[0].map(h => h.trim());
                const headers = rawHeaders.map(h => 
                    h.replace(/[\r\n]+/g, ' ') 
                     .replace(/^\uFEFF/, '') 
                     .replace(/[^a-zA-Z0-9 ]/g, '') 
                     .trim()
                );

                setProcState(prev => ({ ...prev, progress: 50, message: 'Processing rows...' }));

                const parsedData: any[] = [];

                for (let i = 1; i < rows.length; i++) {
                    const values = rows[i];
                    if (values.length === 0 || (values.length === 1 && !values[0])) continue;

                    const row: any = {};
                    headers.forEach((header, index) => {
                        if (header && index < values.length) {
                             row[header] = values[index].trim();
                        }
                    });
                    
                    parsedData.push(row);
                }

                if (parsedData.length === 0) throw new Error("No valid data rows found.");

                setProcState(prev => ({ ...prev, progress: 75, message: 'Saving data...' }));
                
                await storageService.saveLogisticsData(parsedData, (p) => {
                    setProcState(prev => ({ ...prev, progress: 75 + (p * 0.25) }));
                });

                setProcState({
                    isOpen: true,
                    status: 'success',
                    title: 'Upload Complete',
                    message: `Successfully imported ${parsedData.length} records.`,
                    progress: 100
                });
                
                setTimeout(() => setProcState(INITIAL_PROCESSING_STATE), 2000);

            } catch (err: any) {
                console.error("Parse Error", err);
                setProcState({
                    isOpen: true,
                    status: 'error',
                    title: 'Upload Failed',
                    message: err.message || "Failed to parse CSV.",
                    progress: 0
                });
            } finally {
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        }, 100);
    };
    reader.readAsText(file);
  };

  // --- ANALYSIS ---
  const kpis = useMemo(() => {
    let totalContainers = 0;
    let delayed = 0;
    let customsClear = 0;
    let totalCost = 0;

    data.forEach(row => {
        const hasContainer = Object.keys(row).some(k => k.toLowerCase().includes('container') || k.toLowerCase().includes('bl'));
        if (hasContainer) {
             totalContainers++;
        }
        
        const delayKey = Object.keys(row).find(k => k.toLowerCase().includes('delay') || k.toLowerCase().includes('status'));
        if (delayKey && row[delayKey]?.toString().toLowerCase().includes('hold')) {
            delayed++;
        }
        
        const statusKey = Object.keys(row).find(k => k.toLowerCase().includes('status'));
        if (statusKey && (row[statusKey]?.toLowerCase().includes('delivered') || row[statusKey]?.toLowerCase().includes('completed'))) {
            customsClear++;
        }
        
        const costKey = Object.keys(row).find(k => k.toLowerCase().includes('cost') || k.toLowerCase().includes('amount'));
        if (costKey) {
             const valStr = (row[costKey] || '0').replace(/[^0-9.-]+/g,"");
             const val = parseFloat(valStr);
             if (!isNaN(val)) totalCost += val;
        }
    });

    return { totalContainers, delayed, customsClear, totalCost };
  }, [data]);

  const filteredData = useMemo(() => {
      if (!filterText) return data;
      const lower = filterText.toLowerCase();
      // Safe filtering without JSON.stringify which causes circular errors with Firestore objects
      return data.filter(row => {
          return Object.values(row).some(val => 
              val && String(val).toLowerCase().includes(lower)
          );
      });
  }, [data, filterText]);

  // Chart Data Preparation
  const chartData = useMemo(() => {
      const statusCounts: Record<string, number> = {};
      data.forEach(row => {
          const statusKey = Object.keys(row).find(k => k.toLowerCase() === 'status' || k.toLowerCase().includes('estatus')) || 'Unknown';
          let status = (row[statusKey] || 'Unknown');
          if (status.length > 20) status = status.substring(0, 20) + '...';
          statusCounts[status] = (statusCounts[status] || 0) + 1;
      });
      return Object.entries(statusCounts)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6); // Top 6 statuses
  }, [data]);

  return (
    <div className="space-y-6">
      <ProcessingModal state={procState} onClose={() => setProcState(INITIAL_PROCESSING_STATE)} />

      <div className="flex justify-between items-center">
        <div>
            <h1 className="text-2xl font-bold text-slate-800">Logistics Tracking & KPIs</h1>
            <p className="text-slate-500 text-sm">Upload general logistics reports for analysis.</p>
        </div>
        <div>
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                onClick={(e) => (e.currentTarget.value = '')}
                accept=".csv" 
                className="hidden" 
            />
            <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={procState.isOpen}
                className={`flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm transition-colors ${procState.isOpen ? 'opacity-50 cursor-wait' : ''}`}
            >
                {procState.isOpen ? (
                    <>
                        <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"/>
                        <span>Processing...</span>
                    </>
                ) : (
                    <>
                        <Upload size={18} /> Upload Report
                    </>
                )}
            </button>
        </div>
      </div>

      {data.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-300 rounded-xl p-12 text-center">
              <FileSpreadsheet className="mx-auto text-slate-300 mb-4" size={48} />
              <h3 className="text-lg font-medium text-slate-700">No Report Data Found</h3>
              <p className="text-slate-500 mb-6">Upload a CSV file to generate insights.</p>
              <button onClick={() => fileInputRef.current?.click()} className="text-blue-600 font-medium hover:underline">Select File</button>
          </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 font-medium">Total Shipments</p>
                <h3 className="text-2xl font-bold text-slate-800">{kpis.totalContainers}</h3>
              </div>
              <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                <Container size={24} />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 font-medium">Delayed / Hold</p>
                <h3 className="text-2xl font-bold text-red-600">{kpis.delayed}</h3>
              </div>
              <div className="p-3 bg-red-50 text-red-600 rounded-lg">
                <AlertTriangle size={24} />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 font-medium">Cleared / Completed</p>
                <h3 className="text-2xl font-bold text-green-600">{kpis.customsClear}</h3>
              </div>
              <div className="p-3 bg-green-50 text-green-600 rounded-lg">
                <Clock size={24} />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 font-medium">Total Cost</p>
                <h3 className="text-2xl font-bold text-slate-800">${kpis.totalCost.toLocaleString()}</h3>
              </div>
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
                <DollarSign size={24} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Chart */}
            <div className="lg:col-span-1 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="font-semibold text-slate-800 mb-4">Status Distribution</h3>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={chartData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'][index % 5]} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Table */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-[500px]">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="font-semibold text-slate-800">Shipment Data</h3>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input 
                            type="text" 
                            placeholder="Search records..." 
                            value={filterText}
                            onChange={(e) => setFilterText(e.target.value)}
                            className="pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none w-64"
                        />
                    </div>
                </div>
                
                <div className="flex-1 overflow-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0 shadow-sm">
                            <tr>
                                {filteredData.length > 0 && Object.keys(filteredData[0]).slice(0, 6).map((header, idx) => (
                                    <th key={idx} className="px-6 py-3 font-medium whitespace-nowrap">{header}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredData.slice(0, 50).map((row, idx) => (
                                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                    {Object.values(row).slice(0, 6).map((val: any, vIdx) => (
                                        <td key={vIdx} className="px-6 py-3 whitespace-nowrap text-slate-600">
                                            {String(val).length > 30 ? String(val).substring(0, 30) + '...' : String(val)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                            {filteredData.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                                        No matching records found
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="p-3 border-t border-slate-100 text-xs text-slate-400 text-center">
                    Showing top 50 results of {filteredData.length} total
                </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
