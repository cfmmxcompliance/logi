import React, { useState, useEffect, useRef } from 'react';
import { storageService } from '../services/storageService.js';
import { uploadFileToDrive } from '../services/googleDriveService.ts';
import { Monitor, Search, Camera, Check, X, Loader2, Save, MapPin, ShieldCheck, ImageIcon, ArrowLeft, FileText, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Re-usamos el Folder ID del módulo de escritorio
const AF_DRIVE_FOLDER_ID = '1SDMN4BEa6TeyAcgpAABB9bis1OUXmLAa';

export default function ActivosFijosScreen() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('logimaster_user') || '{}');
  const logout = () => {
      localStorage.removeItem('logimaster_user');
      navigate('/login');
  };
  const [assets, setAssets] = useState(storageService.getFixedAssets());

  const [isLoading, setIsLoading] = useState(true);

  React.useEffect(() => {
    // Si el array está vacío (porque se omitió en App.tsx), forzamos la inicialización ligera
    if (storageService.getFixedAssets().length === 0) {
      storageService.initFixedAssetsOnly().then(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
    
    const refresh = () => setAssets([...storageService.getFixedAssets()]);
    refresh();
    return storageService.subscribe(refresh);
  }, []);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedAsset, setSelectedAsset] = useState(null);
  
  // Modos de Vista
  const [viewMode, setViewMode] = useState('HOME');
  const [previewImage, setPreviewImage] = useState(null);
  const [previewPdf, setPreviewPdf] = useState(null);

  // Convierte URL de Drive a URL directa de imagen
  const getDirectImageUrl = (url) => {
    if (!url) return '';
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      // El endpoint de thumbnail es mucho más confiable que 'uc' para etiquetas <img>
      return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1000`;
    }
    return url;
  };

  // Obtiene el modo 'preview' embeddable de Drive para PDFs
  const getPdfPreviewUrl = (url) => {
    if (!url) return '';
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return `https://drive.google.com/file/d/${match[1]}/preview`;
    }
    return url;
  };
  
  // Edit State
  const [existsStatus, setExistsStatus] = useState<string>('SI');
  const [warehouse, setWarehouse] = useState('');
  const [area, setArea] = useState('');
  const [comments, setComments] = useState('');
  
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus al entrar
  useEffect(() => {
    if (!selectedAsset) {
      searchInputRef.current?.focus();
    }
  }, [selectedAsset]);

  // Buscador inteligente en tiempo real (Teclado / Escáner)
  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }
    
    const query = searchTerm.toLowerCase();
    const results = assets.filter(a => 
      a.id.toLowerCase().includes(query) ||
      (a.mbl && a.mbl.toLowerCase().includes(query)) ||
      (a.pedimento && a.pedimento.toLowerCase().includes(query)) ||
      (a.partNumber && a.partNumber.toLowerCase().includes(query)) ||
      (a.physicalSerialNumber && a.physicalSerialNumber.toLowerCase().includes(query)) ||
      (a.cfmotoPartNumber && a.cfmotoPartNumber.toLowerCase().includes(query))
    );
    
    // Solo mostrar hasta 10 para no trabar el celular
    setSearchResults(results.slice(0, 10));
    
    // Si encuentra EXACTAMENTE uno por ID de Sistema, autoseleccionarlo
    if (results.length === 1 && results[0].id.toLowerCase() === query) {
      handleAssetSelect(results[0]);
    }
  }, [searchTerm, assets]);

  const handleAssetSelect = (asset) => {
    setSelectedAsset(asset);
    setExistsStatus(asset.exists || 'SI');
    setWarehouse(asset.warehouse || '');
    setArea(asset.area || '');
    setComments(asset.comments || '');
    setSearchTerm('');
  };

  const handleSaveAudit = async () => {
    if (!selectedAsset) return;
    setIsSaving(true);
    try {
      const auditNote = `\n[Auditado por ${user?.name || user?.email} el ${new Date().toLocaleDateString()}]`;
      const newComments = comments.includes('[Auditado por') ? comments : comments + auditNote;

      const updatedAsset = {
        ...selectedAsset,
        exists: existsStatus,
        warehouse,
        area,
        comments: newComments,
      };

      await storageService.updateFixedAsset(updatedAsset);
      
      // Notificar éxito nativo (vibrar si está disponible)
      if (navigator.vibrate) navigator.vibrate(100);
      
      setSelectedAsset(null);
      setSearchTerm('');
      alert("✅ Auditoría guardada exitosamente.");
    } catch (error) {
      alert("Error al guardar: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePhotoUpload = async (e) => {
    if (!selectedAsset || !e.target.files || e.target.files.length === 0) return;
    
    const file = e.target.files[0];
    setIsUploading(true);
    
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const filename = `AF_AUDIT_${selectedAsset.mbl || 'SC'}_${Date.now()}.${ext}`;
      
      // 1. Subir a Drive
      const urlResult = await uploadFileToDrive(file, filename, AF_DRIVE_FOLDER_ID);
      const fileUrl = urlResult.webViewLink;
      
      // 2. Anexar a la galería del activo
      const newPhoto = {
        id: `photo_${Date.now()}`,
        url: fileUrl,
        uploadedBy: user?.email || 'Handheld',
        uploadedAt: new Date().toISOString()
      };
      
      const updatedPhotos = [...(selectedAsset.photos || [])];
      
      // Si la foto legacy está ocupada pero no en el array, la metemos primero (migración transparente)
      if (selectedAsset.photoUrl && updatedPhotos.length === 0 && selectedAsset.photoUrl !== 'SI (Adjunto)') {
          updatedPhotos.push({
              id: 'legacy',
              url: selectedAsset.photoUrl,
              uploadedBy: selectedAsset.photoUploadedBy || 'Desconocido',
              uploadedAt: selectedAsset.photoUploadedAt || new Date().toISOString()
          });
      }
      
      updatedPhotos.push(newPhoto);

      // 3. Guardar en BD
      const updatedAsset = {
        ...selectedAsset,
        photos: updatedPhotos
      };
      
      await storageService.updateFixedAsset(updatedAsset);
      setSelectedAsset(updatedAsset); // Actualizar vista local
      
      if (navigator.vibrate) navigator.vibrate([50, 50, 50]); // Success vibration
      
    } catch (error) {
      alert("Error al subir foto: " + error.message);
    } finally {
      setIsUploading(false);
      e.target.value = ''; // Reset input
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col font-sans pb-24">
      {/* ── HEADER ── */}
      <div className="flex-shrink-0 bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
        {viewMode !== 'HOME' && (
          <button 
            onClick={() => {
              setViewMode('HOME');
              setSelectedAsset(null);
              setSearchTerm('');
            }} 
            className="p-2 text-slate-400 hover:text-white rounded-xl active:scale-95 transition-all"
          >
            <ArrowLeft size={22} />
          </button>
        )}
        <div className="flex-1">
          <h1 className="text-lg font-bold tracking-tight flex items-center gap-2 text-white">
            <Monitor size={20} className="text-indigo-400" /> 
            {viewMode === 'HOME' ? 'Activos Fijos' : viewMode === 'CONSULTA' ? 'Consulta de Activos' : 'Auditoría Activo Fijo'}
          </h1>
          <p className="text-xs text-slate-400">
            {viewMode === 'HOME' ? 'Módulo de Inventario' : 'Búsqueda y Verificación'}
          </p>
        </div>
      </div>

      <div className="flex-1 p-4 flex flex-col gap-4 max-w-lg mx-auto w-full">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-48 text-indigo-400">
            <Loader2 size={36} className="animate-spin mb-4" />
            <p className="font-medium animate-pulse">Cargando base de datos de activos...</p>
          </div>
        ) : viewMode === 'HOME' ? (
          <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-4 duration-300">
             {/* Replica del control de usuario (HandheldHome) */}
             <div className="flex items-center gap-4 bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50 backdrop-blur-sm">
                 <div className="w-14 h-14 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center">
                     <ShieldCheck size={28} />
                 </div>
                 <div className="text-left">
                     <p className="text-slate-400 text-sm font-medium">Operario</p>
                     <h1 className="text-xl font-bold text-white tracking-tight">{user?.name || user?.username || user?.email}</h1>
                 </div>
             </div>

             <div className="grid grid-cols-1 gap-4 mt-2">
                 <button 
                    onClick={() => setViewMode('CONSULTA')}
                    className="bg-slate-800 hover:bg-slate-700 border border-slate-700 p-6 rounded-[24px] shadow-lg flex items-center gap-5 transition-transform active:scale-95 text-left group"
                 >
                    <div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center text-white shadow-[0_0_20px_rgba(59,130,246,0.3)] group-hover:scale-105 transition-transform">
                       <Search size={32} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white tracking-tight">Consulta</h2>
                        <p className="text-slate-400 text-sm mt-1 font-medium">Buscar y ver información</p>
                    </div>
                 </button>

                 <button 
                    onClick={() => setViewMode('AUDITORIA')}
                    className="bg-slate-800 hover:bg-slate-700 border border-slate-700 p-6 rounded-[24px] shadow-lg flex items-center gap-5 transition-transform active:scale-95 text-left group"
                 >
                    <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-[0_0_20px_rgba(16,185,129,0.3)] group-hover:scale-105 transition-transform">
                       <Camera size={32} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white tracking-tight">Auditoría / Levantamiento</h2>
                        <p className="text-slate-400 text-sm mt-1 font-medium">Validación física y fotos</p>
                    </div>
                 </button>
             </div>

             <div className="w-full mt-auto mb-4 flex flex-col gap-3 pt-4 border-t border-slate-800">
                 <button 
                     onClick={() => logout()}
                     className="w-full h-[56px] bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded-2xl font-bold shadow-lg transition-all flex items-center justify-center gap-3 text-lg"
                 >
                     <LogOut size={22} className="text-slate-400" />
                     Cerrar Sesión
                 </button>
             </div>
          </div>
        ) : !selectedAsset ? (
          // --- MODO BÚSQUEDA ---
          <>
            <div className="bg-slate-800 p-4 rounded-3xl border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.15)] flex flex-col gap-3">
              <div className="flex items-center gap-3 text-indigo-400">
                <Search size={24} />
                <h2 className="text-lg font-bold text-white">Buscar o Escanear</h2>
              </div>
              <input 
                ref={searchInputRef}
                type="text"
                placeholder="Escanea etiqueta o ingresa ID..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-slate-900 border-2 border-slate-700 focus:border-indigo-500 rounded-2xl px-4 py-4 text-white text-lg font-mono outline-none transition-colors"
                autoFocus
              />
              <p className="text-slate-500 text-xs text-center">
                Busca por ID, MBL, Pedimento, o Número de Parte.
              </p>
            </div>

            {/* Resultados */}
            {searchResults.length > 0 && (
              <div className="flex flex-col gap-3">
                <h3 className="text-slate-400 font-bold text-sm px-2 uppercase tracking-wider">Resultados ({searchResults.length})</h3>
                {searchResults.map(a => (
                  <button 
                    key={a.id} 
                    onClick={() => handleAssetSelect(a)}
                    className="bg-slate-800 border border-slate-700 hover:bg-slate-700 hover:border-indigo-500 rounded-2xl p-4 text-left transition-all active:scale-95 flex flex-col gap-2 shadow-lg"
                  >
                    <div className="flex justify-between items-start">
                      <span className="text-white font-bold text-lg">{a.partNumber || 'SIN NUM PARTE'}</span>
                      <span className="bg-slate-900 text-slate-300 text-xs px-2 py-1 rounded-lg border border-slate-700">
                        {a.id.substring(0,6)}...
                      </span>
                    </div>
                    <p className="text-indigo-400 text-sm font-medium line-clamp-1">{a.materialName || a.descriptionPartNumber}</p>
                    <div className="flex gap-4 mt-1 text-xs text-slate-400">
                      <span>📦 MBL: {a.mbl || '-'}</span>
                      <span>📄 Pedimento: {a.pedimento || '-'}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            
            {searchTerm && searchResults.length === 0 && (
              <div className="text-center p-8 text-slate-500">
                No se encontró ningún activo fijo.
              </div>
            )}
          </>
        ) : (
          // --- MODO AUDITORÍA / LEVANTAMIENTO ---
          <div className="flex flex-col gap-4 animate-in slide-in-from-bottom-4 duration-300">
            
            <button 
              onClick={() => setSelectedAsset(null)}
              className="text-slate-400 font-bold text-sm flex items-center gap-2 hover:text-white transition-colors"
            >
              ← Volver a buscar
            </button>

            {/* Ficha Principal */}
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-5 rounded-3xl border border-indigo-500/40 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
              
              <h2 className="text-2xl font-black text-white tracking-tight leading-tight relative z-10">
                {selectedAsset.partNumber || 'SIN NÚMERO'}
              </h2>
              <p className="text-indigo-300 font-medium text-sm mt-1 mb-4 relative z-10">
                {selectedAsset.materialName || selectedAsset.descriptionPartNumber}
              </p>
              
              <div className="grid grid-cols-2 gap-3 relative z-10">
                <div className="bg-slate-900/80 rounded-xl p-3 border border-slate-700/50">
                  <p className="text-slate-500 text-[10px] uppercase font-bold">Pedimento</p>
                  <p className="text-slate-200 text-sm font-mono mt-0.5 break-all">{selectedAsset.pedimento || '-'}</p>
                </div>
                <div className="bg-slate-900/80 rounded-xl p-3 border border-slate-700/50">
                  <p className="text-slate-500 text-[10px] uppercase font-bold">Serial Físico</p>
                  <p className="text-slate-200 text-sm font-mono mt-0.5 break-all">{selectedAsset.physicalSerialNumber || '-'}</p>
                </div>
              </div>
            </div>

            {/* Detalles Técnicos */}
            <div className="bg-slate-800 p-5 rounded-3xl border border-slate-700 shadow-lg">
                <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                   <Monitor size={18} className="text-blue-400"/> Información Completa
                </h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
                   <div>
                      <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">No. Parte CFMoto</p>
                      <p className="text-slate-200 font-mono mt-0.5 break-all">{selectedAsset.cfmotoPartNumber || '-'}</p>
                   </div>
                   <div>
                      <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Marca</p>
                      <p className="text-slate-200 font-medium mt-0.5">{selectedAsset.physicalBrand || '-'}</p>
                   </div>
                   <div>
                      <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Modelo</p>
                      <p className="text-slate-200 font-medium mt-0.5 break-all">{selectedAsset.physicalModel || '-'}</p>
                   </div>
                   <div>
                      <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Cant / Fracción (HTS)</p>
                      <p className="text-slate-200 font-medium mt-0.5">{selectedAsset.qty || '-'} / {selectedAsset.htsCode || '-'}</p>
                   </div>
                   <div className="col-span-2">
                      <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">MBL / Contenedor</p>
                      <p className="text-slate-200 font-medium mt-0.5">{selectedAsset.mbl || '-'}  •  {selectedAsset.containerNumber || '-'}</p>
                   </div>
                   <div>
                      <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Factura / Origen</p>
                      <p className="text-slate-200 font-medium mt-0.5">{selectedAsset.invoice || '-'} / {selectedAsset.countryOrigin || '-'}</p>
                   </div>
                   <div>
                      <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Valor Unit. / Total (USD)</p>
                      <p className="text-slate-200 font-medium mt-0.5">${selectedAsset.unitPriceUsd || '0'} / ${selectedAsset.amountUsd || '0'}</p>
                   </div>
                   <div className="col-span-2">
                      <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Marca / Modelo / Serie (Según Pedimento)</p>
                      <p className="text-slate-200 font-medium mt-0.5">{selectedAsset.brandPedimento || '-'} / {selectedAsset.modelPedimento || '-'} / {selectedAsset.serialNumberPedimento || '-'}</p>
                   </div>
                   <div>
                      <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Planta / Localización</p>
                      <p className="text-slate-200 font-medium mt-0.5 break-all">{selectedAsset.localizationPlant || '-'}</p>
                   </div>
                   <div>
                      <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Responsable</p>
                      <p className="text-slate-200 font-medium mt-0.5">{selectedAsset.responsible || '-'}</p>
                   </div>
                   <div>
                      <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Parte del Proceso</p>
                      <p className="text-slate-200 font-medium mt-0.5 break-all">{selectedAsset.partOfProcess || '-'}</p>
                   </div>
                   <div>
                      <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Trazable</p>
                      <p className="text-slate-200 font-medium mt-0.5">{selectedAsset.trazable || '-'}</p>
                   </div>
                   <div className="col-span-2">
                      <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Físico Digital Pedimento / ID Aduana</p>
                      <p className="text-slate-200 font-medium mt-0.5 break-all">{selectedAsset.physicalDigitalPedimento || '-'} / {selectedAsset.physicalIdCustomsInfo || '-'}</p>
                   </div>
                   <div className="col-span-2">
                      <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Descripción (Español / Inglés / Chino)</p>
                      <p className="text-slate-200 font-medium mt-0.5 leading-relaxed">
                         {selectedAsset.spanishDescription || '-'} 
                         {selectedAsset.englishDescription && <><br/><span className="text-slate-400 italic text-xs">{selectedAsset.englishDescription}</span></>}
                         {selectedAsset.chineseDescription && <><br/><span className="text-slate-400 text-xs">{selectedAsset.chineseDescription}</span></>}
                      </p>
                   </div>
                   
                   {/* Documentos Adjuntos */}
                   {(selectedAsset.pedimentoPdfUrl || selectedAsset.invoicePdfUrl) && (
                     <div className="col-span-2 mt-2 pt-4 border-t border-slate-700/50">
                        <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-2">Documentos Adjuntos</p>
                        <div className="flex gap-2">
                          {selectedAsset.pedimentoPdfUrl && (
                            <button 
                              onClick={() => setPreviewPdf(selectedAsset.pedimentoPdfUrl)}
                              className="flex-1 bg-slate-900/50 hover:bg-slate-700 border border-slate-600 rounded-xl p-2 flex items-center justify-center gap-2 text-indigo-400 text-xs font-bold transition-colors"
                            >
                              <FileText size={16} /> Pedimento
                            </button>
                          )}
                          {selectedAsset.invoicePdfUrl && (
                            <button 
                              onClick={() => setPreviewPdf(selectedAsset.invoicePdfUrl)}
                              className="flex-1 bg-slate-900/50 hover:bg-slate-700 border border-slate-600 rounded-xl p-2 flex items-center justify-center gap-2 text-pink-400 text-xs font-bold transition-colors"
                            >
                              <FileText size={16} /> Factura
                            </button>
                          )}
                        </div>
                     </div>
                   )}
                </div>
            </div>

            {/* Panel de Auditoría Físca */}
            <div className="bg-slate-800 p-5 rounded-3xl border border-slate-700 shadow-lg flex flex-col gap-5">
              
              {/* Toggle Existe (Disabled en Consulta) */}
              <div>
                <label className="text-slate-400 text-sm font-bold block mb-3">¿Existe Físicamente?</label>
                <div className="grid grid-cols-3 gap-2">
                  <button 
                    disabled={viewMode === 'CONSULTA'}
                    onClick={() => setExistsStatus('SI')}
                    className={`py-3 rounded-xl font-bold text-sm border transition-all ${existsStatus === 'SI' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' : 'bg-slate-900 border-slate-700 text-slate-500'} ${viewMode === 'CONSULTA' ? 'opacity-70 cursor-not-allowed' : ''}`}
                  >
                    SÍ
                  </button>
                  <button 
                    disabled={viewMode === 'CONSULTA'}
                    onClick={() => setExistsStatus('NO')}
                    className={`py-3 rounded-xl font-bold text-sm border transition-all ${existsStatus === 'NO' ? 'bg-red-500/20 text-red-400 border-red-500/50' : 'bg-slate-900 border-slate-700 text-slate-500'} ${viewMode === 'CONSULTA' ? 'opacity-70 cursor-not-allowed' : ''}`}
                  >
                    NO
                  </button>
                  <button 
                    disabled={viewMode === 'CONSULTA'}
                    onClick={() => setExistsStatus('DAÑADO')}
                    className={`py-3 rounded-xl font-bold text-sm border transition-all ${existsStatus === 'DAÑADO' ? 'bg-amber-500/20 text-amber-400 border-amber-500/50' : 'bg-slate-900 border-slate-700 text-slate-500'} ${viewMode === 'CONSULTA' ? 'opacity-70 cursor-not-allowed' : ''}`}
                  >
                    DAÑADO
                  </button>
                </div>
              </div>

              <div className="h-px bg-slate-700/50 w-full"></div>

              {/* Ubicación */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 text-xs font-bold block mb-2 flex items-center gap-1">
                    <MapPin size={12} /> Almacén
                  </label>
                  <input 
                    type="text" 
                    value={warehouse}
                    disabled={viewMode === 'CONSULTA'}
                    onChange={e => setWarehouse(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-3 text-white text-sm outline-none focus:border-indigo-500 disabled:opacity-70 disabled:cursor-not-allowed"
                    placeholder="Ej. MAT"
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-xs font-bold block mb-2 flex items-center gap-1">
                    <MapPin size={12} /> Área / Rack
                  </label>
                  <input 
                    type="text" 
                    value={area}
                    disabled={viewMode === 'CONSULTA'}
                    onChange={e => setArea(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-3 text-white text-sm outline-none focus:border-indigo-500 disabled:opacity-70 disabled:cursor-not-allowed"
                    placeholder="Ej. R-12"
                  />
                </div>
              </div>

              {/* Comentarios */}
              <div>
                <label className="text-slate-400 text-xs font-bold block mb-2">Observaciones / Comentarios</label>
                <textarea 
                  value={comments}
                  disabled={viewMode === 'CONSULTA'}
                  onChange={e => setComments(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-3 text-white text-sm outline-none focus:border-indigo-500 h-24 resize-none disabled:opacity-70 disabled:cursor-not-allowed"
                  placeholder="Detalles de la condición física..."
                ></textarea>
              </div>

            </div>

            {viewMode === 'AUDITORIA' ? (
              <>
                {/* Zona de Cámara Fija */}
                <div className="bg-slate-800 p-5 rounded-3xl border border-slate-700 shadow-lg relative overflow-hidden">
                  <div className="flex justify-between items-end mb-4 relative z-10">
                    <div>
                      <h3 className="text-white font-bold">Evidencia Fotográfica</h3>
                      <p className="text-slate-400 text-xs mt-1">Fotos actuales: {selectedAsset.photos?.length || 0}</p>
                    </div>
                  </div>
                  
                  <div className="relative">
                    <input 
                      type="file" 
                      accept="image/*" 
                      capture="environment" 
                      onChange={handlePhotoUpload}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                      disabled={isUploading}
                    />
                    <div className={`w-full h-24 rounded-2xl flex flex-col items-center justify-center gap-2 border-2 border-dashed transition-all
                      ${isUploading ? 'bg-indigo-500/10 border-indigo-500/50 text-indigo-400' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500 hover:bg-slate-800'}`}>
                      {isUploading ? (
                        <>
                          <Loader2 size={28} className="animate-spin" />
                          <span className="font-bold text-sm">Subiendo a Nube...</span>
                        </>
                      ) : (
                        <>
                          <Camera size={32} className="text-slate-300" />
                          <span className="font-bold text-sm text-white">📸 Tomar Foto de Evidencia</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Guardar */}
                <button 
                  onClick={handleSaveAudit}
                  disabled={isSaving || isUploading}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black text-lg py-5 rounded-3xl shadow-[0_0_20px_rgba(79,70,229,0.4)] flex items-center justify-center gap-3 transition-transform active:scale-95 disabled:opacity-50 mt-2"
                >
                  {isSaving ? <Loader2 size={24} className="animate-spin" /> : <Save size={24} />}
                  {isSaving ? 'GUARDANDO...' : 'GUARDAR AUDITORÍA'}
                </button>
              </>
            ) : (
              <div className="bg-slate-800 p-5 rounded-3xl border border-slate-700 shadow-lg mt-2">
                 <h3 className="text-white font-bold mb-3 flex items-center gap-2">
                   <ImageIcon size={20} className="text-blue-400"/> Fotos (Modo Consulta)
                 </h3>
                 <p className="text-slate-400 text-xs mb-4">Solo lectura. Para añadir evidencia, usa el modo Auditoría.</p>
                 {selectedAsset.photos && selectedAsset.photos.length > 0 ? (
                   <div className="grid grid-cols-2 gap-3">
                     {selectedAsset.photos.map(p => (
                       <button 
                         key={p.id} 
                         onClick={() => setPreviewImage(getDirectImageUrl(p.url))}
                         className="relative aspect-square bg-slate-900 rounded-xl overflow-hidden border border-slate-700 block group active:scale-95 transition-transform"
                       >
                         <img 
                           src={getDirectImageUrl(p.url)} 
                           alt="Evidencia" 
                           className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" 
                           onError={(e) => {
                             const target = e.target;
                             if (!target.src.includes('preview')) {
                               const match = p.url.match(/\/d\/([a-zA-Z0-9_-]+)/);
                               if (match && match[1]) {
                                 target.outerHTML = `
                                   <div style="width: 100%; height: 100%; overflow: hidden; position: relative;">
                                     <iframe src="https://drive.google.com/file/d/${match[1]}/preview" style="position: absolute; top: -60px; left: 0; width: 100%; height: calc(100% + 60px); border: 0; pointer-events: none;"></iframe>
                                   </div>`;
                               }
                             }
                           }}
                         />
                       </button>
                     ))}
                   </div>
                 ) : (
                   <div className="text-center p-6 bg-slate-900 rounded-xl border border-slate-800 border-dashed">
                     <p className="text-slate-500 text-sm">Sin fotografías adjuntas.</p>
                   </div>
                 )}
              </div>
            )}
            
          </div>
        )}
      </div>

      {/* Visor de Imagen Interno (Sin salir a Drive) */}
      {previewImage && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
          <div className="p-4 flex justify-between items-center bg-black/50 absolute top-0 w-full z-10">
            <span className="text-white font-bold text-sm">Evidencia Física</span>
            <button 
              onClick={() => setPreviewImage(null)}
              className="bg-slate-800 text-white p-2 rounded-full hover:bg-slate-700 active:scale-95"
            >
              <X size={24} />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4">
            <img 
              src={previewImage} 
              alt="Evidencia Ampliada" 
              className="max-w-full max-h-full object-contain rounded-lg"
              onContextMenu={e => e.preventDefault()} // Prevenir clic derecho/descarga
              onError={(e) => {
                const target = e.target;
                if (!target.src.includes('preview')) {
                  const match = previewImage.match(/\/d\/([a-zA-Z0-9_-]+)/) || previewImage.match(/id=([a-zA-Z0-9_-]+)/);
                  if (match && match[1]) {
                    target.outerHTML = `
                      <div style="width: 100%; height: 100%; overflow: hidden; position: relative; border-radius: 0.5rem;">
                        <iframe src="https://drive.google.com/file/d/${match[1]}/preview" style="position: absolute; top: -60px; left: 0; width: 100%; height: calc(100% + 60px); border: 0;"></iframe>
                      </div>`;
                  }
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Visor de PDF Interno */}
      {previewPdf && (
        <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col">
          <div className="p-4 flex justify-between items-center bg-slate-800 border-b border-slate-700 shadow-md">
            <span className="text-white font-bold text-sm flex items-center gap-2">
              <FileText size={16} className="text-indigo-400"/> Visor de Documento
            </span>
            <button 
              onClick={() => setPreviewPdf(null)}
              className="bg-slate-700 text-white p-2 rounded-full hover:bg-slate-600 active:scale-95"
            >
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 w-full h-full bg-white">
            <iframe 
              src={getPdfPreviewUrl(previewPdf)} 
              title="Visor PDF"
              className="w-full h-full border-0"
              allow="autoplay"
            />
          </div>
        </div>
      )}
    </div>
  );
};
