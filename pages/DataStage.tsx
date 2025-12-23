import React, { useState, useEffect, useRef } from 'react';
import FileUpload from '../components/datastage/FileUpload.tsx';
import DataStageDashboard from '../components/datastage/DataStageDashboard.tsx';
import { processZipFile } from '../services/parser.ts';
import { PedimentoRecord, RawFileParsed, DataStageReport } from '../types.ts';
import { RefreshCcw, Save, Archive, Trash2, Calendar, FileText, ChevronRight, Loader2 } from 'lucide-react';
import { storageService } from '../services/storageService.ts';

export const DataStage = () => {
  const [data, setData] = useState<PedimentoRecord[] | null>(null);
  const [rawFiles, setRawFiles] = useState<RawFileParsed[]>([]);
  const [currentFileName, setCurrentFileName] = useState<string>('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [savedReports, setSavedReports] = useState<DataStageReport[]>([]);
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
      // 1. Load Saved Reports (History)
      setSavedReports(storageService.getDataStageReports());
      const unsub = storageService.subscribe(() => {
          setSavedReports(storageService.getDataStageReports());
      });

      // 2. Load Draft Session (Persistence active view)
      const draft = storageService.getDraftDataStage();
      if (draft && draft.records.length > 0) {
          setData(draft.records);
          setRawFiles(draft.rawFiles);
          setCurrentFileName(draft.fileName);
      }

      return unsub;
  }, []);

  const handleFileSelect = async (file: File) => {
    const potentialName = file.name.replace(/\.zip$/i, '').trim();
    
    // 1. Validation: Check if it matches the CURRENTLY LOADED file
    if (currentFileName && currentFileName === file.name) {
        const confirmReload = window.confirm(
            `⚠️ ARCHIVO EN USO\n\n` +
            `El archivo "${file.name}" es el que estás visualizando actualmente.\n` +
            `¿Deseas recargarlo y reiniciar la visualización?`
        );
        if (!confirmReload) return;
    }

    // 2. Validation: Check if file matches HISTORY records (Case Insensitive)
    const existsInHistory = savedReports.some(r => r.name.toLowerCase() === potentialName.toLowerCase());

    if (existsInHistory) {
        const shouldProceed = window.confirm(
            `⚠️ ARCHIVO DUPLICADO DETECTADO\n\n` +
            `El archivo "${file.name}" ya existe en tu historial de reportes guardados.\n\n` +
            `¿Deseas volver a cargarlo para visualizarlo? (Esto no sobrescribirá el historial automáticamente).`
        );
        if (!shouldProceed) return;
    }

    setLoading(true);
    setError(null);
    setCurrentFileName(file.name);
    try {
      const result = await processZipFile(file);
      if (result.records.length === 0 && result.rawFiles.length === 0) {
        setError("No se encontraron registros válidos ni archivos de texto en el ZIP.");
      } else {
        setData(result.records);
        setRawFiles(result.rawFiles);
        
        // Auto-save draft for persistence
        storageService.saveDraftDataStage({
            records: result.records,
            rawFiles: result.rawFiles,
            fileName: file.name,
            timestamp: new Date().toISOString()
        });
      }
    } catch (err) {
      console.error(err);
      setError("Error al procesar el archivo. Asegúrate de que sea un ZIP válido de Data Stage.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    if(window.confirm("¿Estás seguro de cerrar la vista actual? Esto borrará la sesión activa (pero no los reportes guardados en el historial).")) {
        setData(null);
        setRawFiles([]);
        setCurrentFileName('');
        setError(null);
        storageService.clearDraftDataStage();
    }
  };

  const handleSync = () => {
      // Simulation of syncing data to other modules
      alert(`Sincronización Completada:\n- ${data?.length} operaciones registradas.\n- Datos de proveedores actualizados en el sistema central.`);
  };

  const handleSaveReport = async () => {
      if (!data || !currentFileName) return;
      
      const defaultName = currentFileName.replace(/\.zip$/i, '');
      const reportName = prompt("Nombre para este reporte:", defaultName);
      
      if (!reportName) return;

      // Check if we are overwriting based on chosen name
      const existingReport = savedReports.find(r => r.name.toLowerCase() === reportName.toLowerCase());
      let reportId = crypto.randomUUID();

      if (existingReport) {
          const confirmOverwrite = window.confirm(
              `⚠️ YA EXISTE UN REPORTE LLAMADO "${reportName}"\n\n` + 
              `¿Deseas SOBRESCRIBIR la información anterior con estos nuevos datos?`
          );
          if (!confirmOverwrite) return;
          
          reportId = existingReport.id; // Reuse ID to overwrite
      }

      const report: DataStageReport = {
          id: reportId,
          name: reportName,
          timestamp: new Date().toISOString(),
          records: data,
          rawFiles: rawFiles,
          stats: {
              filesProcessed: rawFiles.length,
              pedimentosCount: data.length,
              itemsCount: data.reduce((acc, curr) => acc + curr.items.length, 0),
              invoicesCount: data.reduce((acc, curr) => acc + curr.invoices.length, 0)
          }
      };

      const success = await storageService.saveDataStageReport(report);
      if (success) {
          alert(existingReport ? "✅ Reporte actualizado correctamente." : "✅ Reporte guardado en el historial.");
      }
  };

  const loadReport = (report: DataStageReport) => {
      if (window.confirm(`¿Cargar visualización del reporte "${report.name}"?`)) {
          setData(report.records);
          setRawFiles(report.rawFiles);
          setCurrentFileName(report.name);
          
          // Also update current session draft so it persists if page reloads
          storageService.saveDraftDataStage({
              records: report.records,
              rawFiles: report.rawFiles,
              fileName: report.name,
              timestamp: new Date().toISOString()
          });
      }
  };

  const deleteReport = async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (window.confirm("¿Estás seguro de eliminar este reporte del historial permanentemente?")) {
          await storageService.deleteDataStageReport(id);
      }
  };

  return (
      <div className="space-y-6 relative">
          <div className="flex justify-between items-start">
             <div>
                <h1 className="text-2xl font-bold text-slate-800">Data Stage (Aduanas)</h1>
                <p className="text-slate-500">Procesamiento y análisis de archivos M3 del SAT/VUCEM.</p>
             </div>
             {data && (
                <div className="flex gap-2">
                    <input 
                        type="file" 
                        ref={hiddenInputRef} 
                        className="hidden" 
                        accept=".zip" 
                        onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                                handleFileSelect(e.target.files[0]);
                            }
                            e.target.value = ''; // Reset input to allow selecting same file
                        }}
                    />
                    <button 
                        onClick={handleSaveReport}
                        className="text-sm bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 px-3 py-2 rounded-lg flex items-center gap-2 transition-colors font-medium"
                    >
                        <Save className="w-4 h-4" />
                        Guardar en Historial
                    </button>
                    <button 
                        onClick={() => hiddenInputRef.current?.click()}
                        className="text-sm text-slate-500 hover:text-blue-600 bg-white border border-slate-200 hover:bg-blue-50 px-3 py-2 rounded-lg flex items-center gap-2 transition-colors"
                        title="Cargar un nuevo archivo reemplazando los datos actuales"
                    >
                        <RefreshCcw className="w-4 h-4" />
                        Cargar Otro Archivo
                    </button>
                    <button 
                        onClick={handleReset}
                        className="text-sm text-red-500 hover:text-red-700 bg-white border border-red-200 hover:bg-red-50 px-3 py-2 rounded-lg flex items-center gap-2 transition-colors"
                        title="Cerrar vista actual"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
              )}
          </div>

        {!data ? (
          <div className="max-w-4xl mx-auto mt-8 space-y-12">
            
            {/* Upload Section */}
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
              <FileUpload onFileSelect={handleFileSelect} isProcessing={loading} />
              {error && (
                <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-lg text-sm text-center font-medium border border-red-100">
                  {error}
                </div>
              )}
            </div>

            {/* History Section */}
            {savedReports.length > 0 && (
                <div className="space-y-4">
                    <h3 className="text-lg font-bold text-slate-700 flex items-center gap-2">
                        <Archive size={20} className="text-blue-500" />
                        Historial de Reportes Guardados
                    </h3>
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
                        {savedReports.map((report) => (
                            <div 
                                key={report.id} 
                                onClick={() => loadReport(report)}
                                className="p-4 flex items-center justify-between hover:bg-slate-50 cursor-pointer transition-colors group"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                                        <FileText size={20} />
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-slate-800">{report.name}</h4>
                                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                                            <span className="flex items-center gap-1">
                                                <Calendar size={12} />
                                                {new Date(report.timestamp).toLocaleDateString()}
                                            </span>
                                            <span>•</span>
                                            <span>{report.stats.pedimentosCount} Pedimentos</span>
                                            <span>•</span>
                                            <span>{report.stats.filesProcessed} Archivos</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button 
                                        onClick={(e) => deleteReport(report.id, e)}
                                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                                        title="Eliminar reporte"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                    <ChevronRight className="text-slate-300 group-hover:text-blue-500 transition-colors" size={20} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Features Info */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center pt-4">
                <div className="p-6 bg-white rounded-xl border border-slate-100 shadow-sm">
                    <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center mx-auto mb-3">
                        <span className="font-bold text-lg">501</span>
                    </div>
                    <h3 className="font-semibold text-slate-900">Datos Generales</h3>
                    <p className="text-sm text-slate-500 mt-2">Procesamiento automático de fechas, tipos de cambio y claves de pedimento.</p>
                </div>
                <div className="p-6 bg-white rounded-xl border border-slate-100 shadow-sm">
                    <div className="w-12 h-12 bg-green-100 text-green-600 rounded-xl flex items-center justify-center mx-auto mb-3">
                        <span className="font-bold text-lg">551</span>
                    </div>
                    <h3 className="font-semibold text-slate-900">Partidas y Mercancías</h3>
                    <p className="text-sm text-slate-500 mt-2">Desglose detallado por fracción arancelaria y valores comerciales.</p>
                </div>
                <div className="p-6 bg-white rounded-xl border border-slate-100 shadow-sm">
                    <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center mx-auto mb-3">
                        <span className="font-bold text-lg">AI</span>
                    </div>
                    <h3 className="font-semibold text-slate-900">Análisis Inteligente</h3>
                    <p className="text-sm text-slate-500 mt-2">Integramos Gemini para detectar tendencias y resumir tus operaciones.</p>
                </div>
            </div>
          </div>
        ) : (
          <div className="relative">
              {loading && (
                  <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-xl">
                      <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
                      <h3 className="text-xl font-bold text-slate-800">Procesando Nuevo Archivo...</h3>
                      <p className="text-slate-500">Actualizando dashboard y resumen</p>
                  </div>
              )}
              <DataStageDashboard data={data} rawFiles={rawFiles} onSync={handleSync} />
          </div>
        )}
      </div>
  );
};