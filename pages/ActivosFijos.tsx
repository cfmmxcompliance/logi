import React, { useState, useMemo } from 'react';
import { FixedAsset, UserRole } from '../types.ts';
import { storageService } from '../services/storageService.ts';
import { uploadFileToDrive } from '../services/googleDriveService.ts';
import { useAuth } from '../context/useAuth';
import { CatalogQueryBuilder, QueryCondition, evaluateCondition } from '../components/CatalogQueryBuilder.tsx';
import { 
  Search, Plus, Edit2, Trash2, Download, AlertCircle, 
  UploadCloud, FileText, Loader2, Monitor, MapPin, CheckCircle, Database, Upload, Image as ImageIcon, Maximize, Filter, X
} from 'lucide-react';
import * as XLSX from 'xlsx';

const AF_ORDER_KEYS = [
  'mbl', 'containerNumber', 'pedimento', 'pedimentoPdfUrl', 'date',
  'clavePedimento', 'secuenciaPedimento', 'descriptionPartNumber', 'htsCode', 'qty',
  'partNumber', 'cfmotoPartNumber', 'spanishDescription', 'englishDescription', 'chineseDescription',
  'materialName', 'physicalBrand', 'physicalModel', 'physicalSerialNumber', 'photos',
  'exists', 'countryOrigin', 'invoice', 'unitPriceUsd', 'amountUsd',
  'validadoDataStage', 'brandPedimento', 'modelPedimento', 'serialNumberPedimento', 'localizationPlant',
  'trazable', 'physicalDigitalPedimento', 'physicalIdCustomsInfo', 'responsible', 'partOfProcess',
  'warehouse', 'area', 'document', 'facturaPdfUrl', 'etiqueta', 'comments'
];

const AF_DRIVE_FOLDER_ID = '1SDMN4BEa6TeyAcgpAABB9bis1OUXmLAa';

export const ActivosFijos: React.FC = () => {
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole([UserRole.ADMIN]);

  const [assets, setAssets] = useState<FixedAsset[]>(storageService.getFixedAssets());
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<FixedAsset | null>(null);
  const [managingPhotos, setManagingPhotos] = useState<FixedAsset | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);
  
  // Advanced Query Builder
  const [isQueryBuilderOpen, setIsQueryBuilderOpen] = useState(false);
  const [conditions, setConditions] = useState<QueryCondition[]>([]);

  // Mass Upload
  const [isUploadingCSV, setIsUploadingCSV] = useState(false);

  // Form State
  const [formData, setFormData] = useState<Partial<FixedAsset>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [summaryModal, setSummaryModal] = useState<{isOpen: boolean, column: string, data: {val: string, count: number}[], totalCount: number}>({isOpen: false, column: '', data: [], totalCount: 0});
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const handleOpenSummary = (key: string) => {
      if (key === 'pedimentoPdfUrl' || key === 'facturaPdfUrl' || key === 'photos') return;
      const frequencyMap: Record<string, number> = {};
      filteredAssets.forEach(p => {
          let val = (p as any)[key];
          val = (val === null || val === undefined || String(val).trim() === '') ? '(Vacío)' : String(val).trim();
          frequencyMap[val] = (frequencyMap[val] || 0) + 1;
      });
      const data = Object.entries(frequencyMap)
          .map(([val, count]) => ({ val, count }))
          .sort((a, b) => b.count - a.count);
      
      setSummaryModal({
          isOpen: true,
          column: key,
          data,
          totalCount: filteredAssets.length
      });
  };

  const handleFilterByDesglose = (val: string) => {
    const actualVal = val === '(Vacío)' ? '' : val;
    setConditions([
      ...conditions, 
      { 
        id: Date.now().toString(), 
        column: summaryModal.column as any, 
        operator: actualVal === '' ? 'empty' : '==', 
        type: 'string', 
        input: actualVal 
      }
    ]);
    setSummaryModal({ ...summaryModal, isOpen: false });
  };

  React.useEffect(() => {
    const refresh = () => setAssets([...storageService.getFixedAssets()]);
    refresh();
    return storageService.subscribe(refresh);
  }, []);

  const filteredAssets = useMemo(() => {
    let result = assets;
    
    // Multi-term Search
    if (searchTerm) {
      const terms = searchTerm.toLowerCase().split(/[\s,]+/).filter(Boolean);
      result = result.filter(a => {
        const fullString = Object.values(a).map(v => String(v || '')).join(' ').toLowerCase();
        return terms.every(term => fullString.includes(term));
      });
    }

    // Query Builder Conditions
    if (conditions.length > 0) {
      result = result.filter(a => {
        return conditions.every(cond => {
          const val = (a as any)[cond.column];
          return evaluateCondition(val, cond);
        });
      });
    }

    return result;
  }, [assets, searchTerm, conditions]);

  const handleOpenModal = (asset?: FixedAsset) => {
    if (asset) {
      setEditingAsset(asset);
      setFormData(asset);
    } else {
      setEditingAsset(null);
      setFormData({
        exists: 'SI',
        validadoDataStage: 'PENDIENTE',
        countryOrigin: 'CHN',
        trazable: 'SI',
        physicalDigitalPedimento: 'DIGITAL'
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    try {
      const payload = formData as FixedAsset;
      if (editingAsset) {
        await storageService.updateFixedAsset(payload);
      } else {
        // Prevent exact logical duplicates
        const isLogicalDuplicate = assets.some(a => 
          a.pedimento === payload.pedimento &&
          a.partNumber === payload.partNumber &&
          a.physicalSerialNumber === payload.physicalSerialNumber &&
          (payload.pedimento || payload.partNumber || payload.physicalSerialNumber)
        );
        if (isLogicalDuplicate) {
          alert('Este registro (Pedimento, Número de Parte y Serie Física) ya existe.');
          setIsSaving(false);
          return;
        }
        await storageService.addFixedAsset(payload);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      alert('Error guardando activo: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Estás seguro de eliminar este Activo Fijo permanentemente?')) return;
    try {
      await storageService.deleteFixedAsset(id);
    } catch (err: any) {
      alert('Error eliminando: ' + err.message);
    }
  };

  const processFileUpload = async (asset: FixedAsset, file: File) => {
    setIsUploadingPhoto(true);
    try {
      const ext = file.name.split('.').pop();
      const filename = `AF_${asset.mbl || 'SIN_MBL'}_${asset.pedimento || 'SIN_PED'}_Foto_${Date.now()}.${ext}`;
      const url = await uploadFileToDrive(file, filename, AF_DRIVE_FOLDER_ID);
      
      const uploadedBy = user?.email || 'sistema';
      const uploadedAt = new Date().toISOString();

      const newPhoto = {
        id: Date.now().toString(),
        url: url.webViewLink,
        uploadedBy,
        uploadedAt
      };

      const updatedPhotos = [...(asset.photos || [])];
      
      if (updatedPhotos.length === 0 && asset.photoUrl && typeof asset.photoUrl === 'string' && asset.photoUrl !== '[object Object]') {
        updatedPhotos.push({
          id: 'legacy',
          url: asset.photoUrl,
          uploadedBy: asset.photoUploadedBy || 'sistema',
          uploadedAt: asset.photoUploadedAt || ''
        });
      }

      updatedPhotos.push(newPhoto);

      const updatedAsset = { ...asset, photos: updatedPhotos };
      await storageService.updateFixedAsset(updatedAsset);
      setManagingPhotos(updatedAsset);
    } catch (err: any) {
      alert('Error al subir archivo: ' + err.message);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  React.useEffect(() => {
    if (!managingPhotos) return;
    const handlePaste = async (e: ClipboardEvent) => {
      const file = e.clipboardData?.files?.[0];
      if (file && !isUploadingPhoto) {
        await processFileUpload(managingPhotos, file);
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [managingPhotos, isUploadingPhoto, user]);

  const handleFileUpload = async (asset: FixedAsset, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFileUpload(asset, file);
    e.target.value = '';
  };

  const handleDeletePhoto = async (asset: FixedAsset, photoId: string) => {
    if (!window.confirm('¿Eliminar esta foto?')) return;
    
    let updatedPhotos = [...(asset.photos || [])];
    
    // Migrate legacy first if needed
    if (updatedPhotos.length === 0 && asset.photoUrl && typeof asset.photoUrl === 'string' && asset.photoUrl !== '[object Object]') {
      updatedPhotos.push({
        id: 'legacy',
        url: asset.photoUrl,
        uploadedBy: asset.photoUploadedBy || 'sistema',
        uploadedAt: asset.photoUploadedAt || ''
      });
    }

    updatedPhotos = updatedPhotos.filter(p => p.id !== photoId);

    const updatedAsset = {
      ...asset,
      photos: updatedPhotos,
      // If we deleted the legacy photo, clear the root properties too
      ...(photoId === 'legacy' ? { photoUrl: '', photoUploadedBy: '', photoUploadedAt: '' } : {})
    };

    await storageService.updateFixedAsset(updatedAsset);
    setManagingPhotos(updatedAsset);
  };

  const handleSingleDocumentUpload = async (asset: FixedAsset, e: React.ChangeEvent<HTMLInputElement>, fieldPrefix: 'pedimentoPdf' | 'invoicePdf') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFor(`${asset.id}-${fieldPrefix}`);
    try {
      const ext = file.name.split('.').pop();
      const filename = `AF_${asset.mbl || 'SIN_MBL'}_${fieldPrefix}_${Date.now()}.${ext}`;
      const url = await uploadFileToDrive(file, filename, AF_DRIVE_FOLDER_ID);
      
      const uploadedBy = user?.email || 'sistema';
      const uploadedAt = new Date().toISOString();

      await storageService.updateFixedAsset({
        ...asset,
        [`${fieldPrefix}Url`]: url.webViewLink,
        [`${fieldPrefix}UploadedBy`]: uploadedBy,
        [`${fieldPrefix}UploadedAt`]: uploadedAt
      });
    } catch (err: any) {
      alert('Error al subir archivo: ' + err.message);
    } finally {
      setUploadingFor(null);
      e.target.value = '';
    }
  };

  const handleExport = () => {
    const exportData = filteredAssets.map(a => ({
      'ID SISTEMA (NO MODIFICAR)': a.id,
      'BOL NUMBER: MBL': a.mbl,
      'CONTAINER NUMBER:': a.containerNumber,
      'IMPORT PEDIMENTO': a.pedimento,
      'PDF PEDIMENTO': a.pedimentoPdfUrl ? 'SI (Adjunto)' : 'NO',
      'DATE': a.date,
      'CLAVE PEDIMENTO': a.clavePedimento,
      'SECUENT PEDIMENTO': a.secuenciaPedimento,
      'DESCRIPTION AND PART NUMBER': a.descriptionPartNumber,
      'HTS CODE': a.htsCode,
      'QTY': a.qty,
      'PART NUMBER OR OTHER IDENTIFICATION NUMBER': a.partNumber,
      'NUMERO DE PARTE CFMOTO (SI APLICA)': a.cfmotoPartNumber,
      'SPANISH': a.spanishDescription,
      'ENGLISH': a.englishDescription,
      'CHINESE': a.chineseDescription,
      'Nombre del material': a.materialName,
      'PHYSICAL BRAND IN PRODUCT': a.physicalBrand,
      'PHYSICAL MODEL IN PRODUCT': a.physicalModel,
      'PHYSICAL SERIAL NUMBER IN PRODUCT': a.physicalSerialNumber,
      'foto1': (a.photos?.length || a.photoUrl) ? 'SI (Adjunto)' : 'NO',
      '¿Existe?': a.exists,
      'COUNTRY ORIGIN': a.countryOrigin,
      'INVOICE': a.invoice,
      'UNIT PRICE USD': a.unitPriceUsd,
      'AMOUNT USD': a.amountUsd,
      'VALIDADO DATA STAGE': a.validadoDataStage,
      'BRAND AT PEDIMENTO': a.brandPedimento,
      'MODEL AT PEDIMENTO': a.modelPedimento,
      'SERIAL NUMBER AT PEDIMENTO': a.serialNumberPedimento,
      'LOCALIZATION IN THE PLANT': a.localizationPlant,
      'TRAZABLE OR NOT TRAZABLE': a.trazable,
      'PHYSICAL / DIGITAL PEDIMENTO': a.physicalDigitalPedimento,
      'PHYSICAL IDENTIFICATION CUSTOMS INFORMATION': a.physicalIdCustomsInfo,
      'RESPONSIBLE': a.responsible,
      'PART OF THE PROCESS': a.partOfProcess,
      'WAREHOUSE': a.warehouse,
      'AREA': a.area,
      'DOCUMENT': a.document,
      'PDF FACTURA': a.invoicePdfUrl ? 'SI (Adjunto)' : 'NO',
      'ETIQUETA': a.etiqueta,
      'COMMENTS': a.comments
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ActivosFijos");
    XLSX.writeFile(wb, `ActivosFijos_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleDownloadTemplate = () => {
    const templateData = [{
      'ID SISTEMA (NO MODIFICAR)': '',
      'BOL NUMBER: MBL': '',
      'CONTAINER NUMBER:': '',
      'IMPORT PEDIMENTO': '',
      'PDF PEDIMENTO': '',
      'DATE': '',
      'CLAVE PEDIMENTO': '',
      'SECUENT PEDIMENTO': '',
      'DESCRIPTION AND PART NUMBER': '',
      'HTS CODE': '',
      'QTY': '',
      'PART NUMBER OR OTHER IDENTIFICATION NUMBER': '',
      'NUMERO DE PARTE CFMOTO (SI APLICA)': '',
      'SPANISH': '',
      'ENGLISH': '',
      'CHINESE': '',
      'Nombre del material': '',
      'PHYSICAL BRAND IN PRODUCT': '',
      'PHYSICAL MODEL IN PRODUCT': '',
      'PHYSICAL SERIAL NUMBER IN PRODUCT': '',
      'foto1': '',
      '¿Existe?': '',
      'COUNTRY ORIGIN': '',
      'INVOICE': '',
      'UNIT PRICE USD': '',
      'AMOUNT USD': '',
      'VALIDADO DATA STAGE': '',
      'BRAND AT PEDIMENTO': '',
      'MODEL AT PEDIMENTO': '',
      'SERIAL NUMBER AT PEDIMENTO': '',
      'LOCALIZATION IN THE PLANT': '',
      'TRAZABLE OR NOT TRAZABLE': '',
      'PHYSICAL / DIGITAL PEDIMENTO': '',
      'PHYSICAL IDENTIFICATION CUSTOMS INFORMATION': '',
      'RESPONSIBLE': '',
      'PART OF THE PROCESS': '',
      'WAREHOUSE': '',
      'AREA': '',
      'DOCUMENT': '',
      'PDF FACTURA': '',
      'ETIQUETA': '',
      'COMMENTS': ''
    }];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla_AF");
    XLSX.writeFile(wb, `Plantilla_Carga_AF.xlsx`);
  };

  const handleMassUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingCSV(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

        const total = rows.length;
        let count = 0;
        
        // Process sequentially or in batches to avoid overwhelming Firestore
        for (const row of rows) {
          const r: any = row;
          const sysId = String(r['ID SISTEMA (NO MODIFICAR)'] || '').trim();
          
          const payload: Partial<FixedAsset> = {
            mbl: String(r['BOL NUMBER: MBL'] || ''),
            containerNumber: String(r['CONTAINER NUMBER:'] || r['CONTAINER NUMBER'] || ''),
            pedimento: String(r['IMPORT PEDIMENTO'] || ''),
            date: String(r['DATE'] || ''),
            clavePedimento: String(r['CLAVE PEDIMENTO'] || ''),
            secuenciaPedimento: String(r['SECUENT PEDIMENTO'] || ''),
            descriptionPartNumber: String(r['DESCRIPTION AND PART NUMBER'] || ''),
            htsCode: String(r['HTS CODE'] || ''),
            qty: Number(r['QTY'] || 0),
            partNumber: String(r['PART NUMBER OR OTHER IDENTIFICATION NUMBER'] || ''),
            cfmotoPartNumber: String(r['NUMERO DE PARTE CFMOTO (SI APLICA)'] || ''),
            spanishDescription: String(r['SPANISH'] || ''),
            englishDescription: String(r['ENGLISH'] || ''),
            chineseDescription: String(r['CHINESE'] || ''),
            materialName: String(r['Nombre del material'] || ''),
            physicalBrand: String(r['PHYSICAL BRAND IN PRODUCT'] || ''),
            physicalModel: String(r['PHYSICAL MODEL IN PRODUCT'] || ''),
            physicalSerialNumber: String(r['PHYSICAL SERIAL NUMBER IN PRODUCT'] || ''),
            photoUrl: String(r['foto1'] || ''),
            exists: String(r['¿Existe?'] || 'SI'),
            countryOrigin: String(r['COUNTRY ORIGIN'] || 'CHN'),
            invoice: String(r['INVOICE'] || ''),
            unitPriceUsd: Number(r['UNIT PRICE USD'] || 0),
            amountUsd: Number(r['AMOUNT USD'] || 0),
            validadoDataStage: String(r['VALIDADO DATA STAGE'] || 'PENDIENTE'),
            brandPedimento: String(r['BRAND AT PEDIMENTO'] || ''),
            modelPedimento: String(r['MODEL AT PEDIMENTO'] || ''),
            serialNumberPedimento: String(r['SERIAL NUMBER AT PEDIMENTO'] || ''),
            localizationPlant: String(r['LOCALIZATION IN THE PLANT'] || ''),
            trazable: String(r['TRAZABLE OR NOT TRAZABLE'] || 'SI'),
            physicalDigitalPedimento: String(r['PHYSICAL / DIGITAL PEDIMENTO'] || 'DIGITAL'),
            physicalIdCustomsInfo: String(r['PHYSICAL IDENTIFICATION CUSTOMS INFORMATION'] || ''),
            responsible: String(r['RESPONSIBLE'] || ''),
            partOfProcess: String(r['PART OF THE PROCESS'] || ''),
            warehouse: String(r['WAREHOUSE'] || ''),
            area: String(r['AREA'] || ''),
            document: String(r['DOCUMENT'] || ''),
            etiqueta: String(r['ETIQUETA'] || ''),
            comments: String(r['COMMENTS'] || '')
          };
          
          // Lógica de Upsert: Basada estrictamente en el ID interno
          const existing = sysId ? assets.find(a => a.id === sysId) : null;

          if (existing) {
             const updated = {
               ...existing,
               ...payload,
               // Restore the photos
               photoUrl: existing.photoUrl,
               photos: existing.photos,
               pedimentoPdfUrl: existing.pedimentoPdfUrl,
               invoicePdfUrl: existing.invoicePdfUrl,
             };
             // Ensure ID is preserved exactly
             updated.id = existing.id;
             await storageService.updateFixedAsset(updated as FixedAsset);
          } else {
             // Limpiar posibles valores de Excel si suben un archivo previamente exportado
             if (payload.photoUrl === 'SI (Adjunto)' || payload.photoUrl === 'NO') payload.photoUrl = '';
             await storageService.addFixedAsset(payload as FixedAsset);
          }
          
          count++;
        }
        
        alert(`¡Carga masiva completa! Se procesaron ${count} activos fijos.`);
      } catch (err: any) {
        alert('Error en carga masiva: ' + err.message);
      } finally {
        setIsUploadingCSV(false);
        e.target.value = '';
      }
    };
    reader.onerror = () => {
      alert("Error leyendo el archivo CSV.");
      setIsUploadingCSV(false);
    };
    reader.readAsBinaryString(file);
  };

  const getDriveDirectUrl = (url: any) => {
    if (!url || typeof url !== 'string') return '';
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return `https://drive.google.com/uc?export=view&id=${match[1]}`;
    }
    return url; // fallback
  };

  const renderInput = (label: string, field: keyof FixedAsset, type = 'text', required = false) => (
    <div>
      <label className="block text-xs font-bold text-slate-600 mb-1">{label} {required && '*'}</label>
      <input 
        type={type} 
        required={required}
        value={(formData[field] as string) || ''} 
        onChange={e => setFormData({...formData, [field]: e.target.value})} 
        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm" 
      />
    </div>
  );

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <AlertCircle size={48} className="text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-slate-800">Acceso Denegado</h2>
        <p className="text-slate-500 mt-2">No tienes permisos para ver el módulo de Activo Fijo.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Monitor className="text-indigo-600" size={28} />
            Control de Activo Fijo
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Catálogo completo con 39 campos aduanales y físicos.
          </p>
        </div>
        <div className="flex gap-3">
          <label className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors shadow-sm cursor-pointer relative">
            {isUploadingCSV ? (
              <><Loader2 size={18} className="animate-spin" /> Subiendo...</>
            ) : (
              <><Upload size={18} /> Subir Masivo (CSV/Excel)</>
            )}
            <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleMassUpload} disabled={isUploadingCSV} />
          </label>
          <button 
            onClick={handleDownloadTemplate}
            className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-3 py-2 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors shadow-sm"
            title="Descargar Plantilla para Carga Masiva"
          >
            <FileText size={18} /> Plantilla
          </button>
          <button 
            onClick={() => setIsQueryBuilderOpen(true)}
            className={`flex items-center gap-2 border px-4 py-2 rounded-xl text-sm font-semibold transition-colors shadow-sm ${conditions.length > 0 ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}
          >
            <Database size={18} /> Filters {conditions.length > 0 && `(${conditions.length})`}
          </button>
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Download size={18} /> Exportar Excel
          </button>
          <button 
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <Plus size={18} /> Nuevo Activo
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="relative max-w-md mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por MBL, Pedimento, Parte, Serie..."
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-600 uppercase text-[11px] font-bold border-b border-slate-200">
              <tr>
                <th className="px-3 py-3">BOL NUMBER: MBL</th>
                <th className="px-3 py-3">CONTAINER NUMBER:</th>
                <th className="px-3 py-3">IMPORT PEDIMENTO</th>
                <th className="px-3 py-3 text-center">PDF PEDIMENTO</th>
                <th className="px-3 py-3">DATE</th>
                <th className="px-3 py-3">CLAVE PEDIMENTO</th>
                <th className="px-3 py-3">SECUENT PEDIMENTO</th>
                <th className="px-3 py-3">DESCRIPTION AND PART NUMBER</th>
                <th className="px-3 py-3">HTS CODE</th>
                <th className="px-3 py-3">QTY</th>
                <th className="px-3 py-3">PART NUMBER OR OTHER ID</th>
                <th className="px-3 py-3">NUMERO DE PARTE CFMOTO</th>
                <th className="px-3 py-3">SPANISH</th>
                <th className="px-3 py-3">ENGLISH</th>
                <th className="px-3 py-3">CHINESE</th>
                <th className="px-3 py-3">Nombre del material</th>
                <th className="px-3 py-3">PHYSICAL BRAND IN PRODUCT</th>
                <th className="px-3 py-3">PHYSICAL MODEL IN PRODUCT</th>
                <th className="px-3 py-3">PHYSICAL SERIAL NUMBER IN PRODUCT</th>
                <th className="px-3 py-3 text-center">FOTOS</th>
                <th className="px-3 py-3">¿Existe?</th>
                <th className="px-3 py-3">COUNTRY ORIGIN</th>
                <th className="px-3 py-3">INVOICE</th>
                <th className="px-3 py-3">UNIT PRICE USD</th>
                <th className="px-3 py-3">AMOUNT USD</th>
                <th className="px-3 py-3">VALIDADO DATA STAGE</th>
                <th className="px-3 py-3">BRAND AT PEDIMENTO</th>
                <th className="px-3 py-3">MODEL AT PEDIMENTO</th>
                <th className="px-3 py-3">SERIAL NUMBER AT PEDIMENTO</th>
                <th className="px-3 py-3">LOCALIZATION IN THE PLANT</th>
                <th className="px-3 py-3">TRAZABLE OR NOT TRAZABLE</th>
                <th className="px-3 py-3">PHYSICAL / DIGITAL PEDIMENTO</th>
                <th className="px-3 py-3">PHYSICAL IDENTIFICATION CUSTOMS INFO</th>
                <th className="px-3 py-3">RESPONSIBLE</th>
                <th className="px-3 py-3">PART OF THE PROCESS</th>
                <th className="px-3 py-3">WAREHOUSE</th>
                <th className="px-3 py-3">AREA</th>
                <th className="px-3 py-3">DOCUMENT</th>
                <th className="px-3 py-3 text-center">PDF FACTURA</th>
                <th className="px-3 py-3">ETIQUETA</th>
                <th className="px-3 py-3">COMMENTS</th>
                <th className="px-3 py-3 text-right sticky right-0 bg-slate-50 border-l border-slate-200 z-10">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredAssets.length === 0 ? (
                <tr>
                  <td colSpan={40} className="px-4 py-8 text-center text-slate-500 text-sm">
                    No se encontraron registros.
                  </td>
                </tr>
              ) : (
                filteredAssets.map(a => (
                  <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-2 font-semibold text-slate-800">{a.mbl || '-'}</td>
                    <td className="px-3 py-2 text-slate-600">{a.containerNumber || '-'}</td>
                    <td className="px-3 py-2 text-indigo-600 font-medium">{a.pedimento || '-'}</td>
                    
                    {/* PDF Pedimento */}
                    <td className="px-3 py-2 text-center bg-slate-50/50">
                      <div className="flex items-center justify-center gap-2">
                        {a.pedimentoPdfUrl ? (
                          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setViewingPhoto(a.pedimentoPdfUrl!); }} className="text-red-600 hover:text-red-800" title={`Ver PDF (Subido por ${a.pedimentoPdfUploadedBy})`}>
                            <FileText size={20} />
                          </button>
                        ) : (
                          <span className="text-slate-300"><FileText size={20} /></span>
                        )}
                        <div className="relative">
                          {uploadingFor === `${a.id}-pedimentoPdf` ? (
                            <Loader2 size={16} className="animate-spin text-indigo-500" />
                          ) : (
                            <label className="cursor-pointer text-slate-400 hover:text-indigo-600 transition-colors" title="Subir PDF Pedimento">
                              <UploadCloud size={18} />
                              <input type="file" accept=".pdf" className="hidden" onChange={(e) => handleSingleDocumentUpload(a, e, 'pedimentoPdf')} />
                            </label>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-3 py-2 text-slate-600">{a.date ? new Date(a.date).toLocaleDateString() : '-'}</td>
                    <td className="px-3 py-2 text-slate-600">{a.clavePedimento || '-'}</td>
                    <td className="px-3 py-2 text-slate-600">{a.secuenciaPedimento || '-'}</td>
                    <td className="px-3 py-2 text-slate-600 max-w-[200px] truncate" title={a.descriptionPartNumber}>{a.descriptionPartNumber || '-'}</td>
                    <td className="px-3 py-2 text-slate-600">{a.htsCode || '-'}</td>
                    <td className="px-3 py-2 text-slate-600">{a.qty || '-'}</td>
                    <td className="px-3 py-2 text-slate-600">{a.partNumber || '-'}</td>
                    <td className="px-3 py-2 text-slate-800">{a.cfmotoPartNumber || '-'}</td>
                    <td className="px-3 py-2 text-slate-600 max-w-[200px] truncate" title={a.spanishDescription}>{a.spanishDescription || '-'}</td>
                    <td className="px-3 py-2 text-slate-600 max-w-[200px] truncate" title={a.englishDescription}>{a.englishDescription || '-'}</td>
                    <td className="px-3 py-2 text-slate-600">{a.chineseDescription || '-'}</td>
                    <td className="px-3 py-2 text-slate-600 max-w-[200px] truncate" title={a.materialName}>{a.materialName || '-'}</td>
                    <td className="px-3 py-2 text-slate-600">{a.physicalBrand || '-'}</td>
                    <td className="px-3 py-2 text-slate-600">{a.physicalModel || '-'}</td>
                    <td className="px-3 py-2 text-slate-600">{a.physicalSerialNumber || '-'}</td>
                    
                    <td className="px-3 py-2 text-center">
                      <div className="flex justify-center">
                        {(() => {
                          let count = a.photos?.length || 0;
                          if (count === 0 && a.photoUrl && typeof a.photoUrl === 'string' && a.photoUrl !== '[object Object]') {
                            count = 1;
                          }
                          return (
                            <button 
                              onClick={() => setManagingPhotos(a)}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${count > 0 ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                            >
                              <ImageIcon size={14} />
                              {count > 0 ? `${count} Foto${count !== 1 ? 's' : ''}` : 'Añadir'}
                            </button>
                          );
                        })()}
                      </div>
                    </td>

                    <td className="px-3 py-2 text-slate-600">{a.exists || '-'}</td>
                    <td className="px-3 py-2 text-slate-600">{a.countryOrigin || '-'}</td>
                    <td className="px-3 py-2 text-slate-600">{a.invoice || '-'}</td>
                    <td className="px-3 py-2 text-slate-600">{a.unitPriceUsd || '-'}</td>
                    <td className="px-3 py-2 text-slate-600">{a.amountUsd || '-'}</td>
                    <td className="px-3 py-2 text-slate-600">{a.validadoDataStage || '-'}</td>
                    <td className="px-3 py-2 text-slate-600">{a.brandPedimento || '-'}</td>
                    <td className="px-3 py-2 text-slate-600">{a.modelPedimento || '-'}</td>
                    <td className="px-3 py-2 text-slate-600">{a.serialNumberPedimento || '-'}</td>
                    <td className="px-3 py-2 text-slate-500">
                      {a.localizationPlant ? (
                        <div className="flex items-center gap-1">
                          <MapPin size={12} className="text-slate-400" /> {a.localizationPlant}
                        </div>
                      ) : '-'}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{a.trazable || '-'}</td>
                    <td className="px-3 py-2 text-slate-600">{a.physicalDigitalPedimento || '-'}</td>
                    <td className="px-3 py-2 text-slate-600 max-w-[150px] truncate" title={a.physicalIdCustomsInfo}>{a.physicalIdCustomsInfo || '-'}</td>
                    <td className="px-3 py-2 text-slate-600">{a.responsible || '-'}</td>
                    <td className="px-3 py-2 text-slate-600">{a.partOfProcess || '-'}</td>
                    <td className="px-3 py-2 text-slate-600">{a.warehouse || '-'}</td>
                    <td className="px-3 py-2 text-slate-600">{a.area || '-'}</td>
                    <td className="px-3 py-2 text-slate-600">{a.document || '-'}</td>
                    
                    {/* PDF Factura */}
                    <td className="px-3 py-2 text-center bg-slate-50/50">
                      <div className="flex items-center justify-center gap-2">
                        {a.invoicePdfUrl ? (
                          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setViewingPhoto(a.invoicePdfUrl!); }} className="text-red-600 hover:text-red-800" title={`Ver PDF (Subido por ${a.invoicePdfUploadedBy})`}>
                            <FileText size={20} />
                          </button>
                        ) : (
                          <span className="text-slate-300"><FileText size={20} /></span>
                        )}
                        <div className="relative">
                          {uploadingFor === `${a.id}-invoicePdf` ? (
                            <Loader2 size={16} className="animate-spin text-indigo-500" />
                          ) : (
                            <label className="cursor-pointer text-slate-400 hover:text-indigo-600 transition-colors" title="Subir PDF Factura">
                              <UploadCloud size={18} />
                              <input type="file" accept=".pdf" className="hidden" onChange={(e) => handleSingleDocumentUpload(a, e, 'invoicePdf')} />
                            </label>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-3 py-2 text-slate-600">{a.etiqueta || '-'}</td>
                    <td className="px-3 py-2 text-slate-600 max-w-[200px] truncate" title={a.comments}>{a.comments || '-'}</td>

                    <td className="px-3 py-2 text-right sticky right-0 bg-white border-l border-slate-200 z-10 group-hover:bg-slate-50">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => handleOpenModal(a)} className="text-slate-400 hover:text-indigo-600 transition-colors" title="Editar">
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => handleDelete(a.id)} className="text-slate-400 hover:text-red-600 transition-colors" title="Eliminar">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="bg-slate-800 text-white font-bold text-xs sticky bottom-0 z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
              <tr>
                {AF_ORDER_KEYS.map(key => {
                    let content: string | number = '';
                    if (['qty', 'unitPriceUsd', 'amountUsd'].includes(key)) {
                        const sum = filteredAssets.reduce((acc, p) => acc + (Number((p as any)[key]) || 0), 0);
                        content = sum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        if (key === 'unitPriceUsd' || key === 'amountUsd') content = `$${content} USD`;
                    } else if (['pedimentoPdfUrl', 'facturaPdfUrl', 'photos'].includes(key)) {
                        content = '-';
                    } else {
                        const unique = new Set(filteredAssets.map(p => (p as any)[key]).filter(v => v !== null && v !== undefined && v !== ''));
                        content = `${unique.size} Dist.`;
                    }
                    return (
                        <td 
                            key={key} 
                            className={`px-3 py-3 border-r border-slate-700 whitespace-nowrap text-center tracking-wide text-[11px] text-blue-100 ${!['pedimentoPdfUrl', 'facturaPdfUrl', 'photos'].includes(key) ? 'cursor-pointer hover:bg-slate-700 transition-colors' : ''}`}
                            onClick={() => !['pedimentoPdfUrl', 'facturaPdfUrl', 'photos'].includes(key) && handleOpenSummary(key)}
                            title={!['pedimentoPdfUrl', 'facturaPdfUrl', 'photos'].includes(key) ? "Click para ver desglose de frecuencias" : undefined}
                        >
                            {content}
                        </td>
                    );
                })}
                <td className="px-3 py-3 border-r border-slate-700 bg-slate-800 z-20 whitespace-nowrap text-blue-300 text-center sticky right-0">Total Filtered: {filteredAssets.length}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Modal Form Extendido (39 Campos) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl h-[95vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Monitor className="text-indigo-600" />
                {editingAsset ? 'Editar Activo Fijo (AF)' : 'Nuevo Activo Fijo (AF)'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors">
                <AlertCircle size={24} className="opacity-0" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
              <form id="af-form" onSubmit={handleSave} className="space-y-8">
                
                {/* 1. Aduanas y Logística */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <h4 className="text-sm font-bold text-indigo-600 uppercase tracking-wider mb-4 flex items-center gap-2 border-b pb-2">
                    <CheckCircle size={16} /> 1. Documentos Aduanales
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {renderInput('BOL NUMBER: MBL', 'mbl', 'text', true)}
                    {renderInput('CONTAINER NUMBER', 'containerNumber')}
                    {renderInput('IMPORT PEDIMENTO', 'pedimento', 'text', true)}
                    {renderInput('DATE', 'date', 'date')}
                    {renderInput('CLAVE PEDIMENTO', 'clavePedimento')}
                    {renderInput('SECUENT PEDIMENTO', 'secuenciaPedimento')}
                    {renderInput('INVOICE', 'invoice')}
                    {renderInput('COUNTRY ORIGIN', 'countryOrigin')}
                  </div>
                </div>

                {/* 2. Descripción e Identificación (Sistema/Pedimento) */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <h4 className="text-sm font-bold text-emerald-600 uppercase tracking-wider mb-4 flex items-center gap-2 border-b pb-2">
                    <CheckCircle size={16} /> 2. Identificación Aduana / Sistema
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    <div className="lg:col-span-2">
                      {renderInput('DESCRIPTION AND PART NUMBER', 'descriptionPartNumber')}
                    </div>
                    {renderInput('HTS CODE', 'htsCode')}
                    {renderInput('QTY', 'qty', 'number')}
                    {renderInput('PART NUMBER OR OTHER ID', 'partNumber')}
                    {renderInput('NUMERO DE PARTE CFMOTO', 'cfmotoPartNumber')}
                    {renderInput('BRAND AT PEDIMENTO', 'brandPedimento')}
                    {renderInput('MODEL AT PEDIMENTO', 'modelPedimento')}
                    {renderInput('SERIAL NUMBER AT PEDIMENTO', 'serialNumberPedimento')}
                    {renderInput('UNIT PRICE USD', 'unitPriceUsd', 'number')}
                    {renderInput('AMOUNT USD', 'amountUsd', 'number')}
                    <div className="col-span-full grid grid-cols-1 md:grid-cols-3 gap-4">
                      {renderInput('SPANISH', 'spanishDescription')}
                      {renderInput('ENGLISH', 'englishDescription')}
                      {renderInput('CHINESE', 'chineseDescription')}
                    </div>
                  </div>
                </div>

                {/* 3. Identificación Física */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <h4 className="text-sm font-bold text-amber-600 uppercase tracking-wider mb-4 flex items-center gap-2 border-b pb-2">
                    <CheckCircle size={16} /> 3. Identificación FÍSICA en Producto
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    <div className="lg:col-span-2">
                      {renderInput('Nombre del material (Español)', 'materialName')}
                    </div>
                    {renderInput('PHYSICAL BRAND IN PRODUCT', 'physicalBrand')}
                    {renderInput('PHYSICAL MODEL IN PRODUCT', 'physicalModel')}
                    {renderInput('PHYSICAL SERIAL NUMBER IN PRODUCT', 'physicalSerialNumber')}
                    
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">¿Existe?</label>
                      <select value={formData.exists || ''} onChange={e => setFormData({...formData, exists: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none text-sm">
                        <option value="SI">SI</option>
                        <option value="NO">NO</option>
                        <option value="N/A">N/A</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">VALIDADO DATA STAGE</label>
                      <select value={formData.validadoDataStage || ''} onChange={e => setFormData({...formData, validadoDataStage: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none text-sm">
                        <option value="VALIDADO">VALIDADO</option>
                        <option value="PENDIENTE">PENDIENTE</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* 4. Localización y Control */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <h4 className="text-sm font-bold text-blue-600 uppercase tracking-wider mb-4 flex items-center gap-2 border-b pb-2">
                    <CheckCircle size={16} /> 4. Localización y Control Interno
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {renderInput('LOCALIZATION IN THE PLANT', 'localizationPlant')}
                    {renderInput('WAREHOUSE', 'warehouse')}
                    {renderInput('AREA', 'area')}
                    {renderInput('RESPONSIBLE', 'responsible')}
                    {renderInput('PART OF THE PROCESS', 'partOfProcess')}
                    
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">TRAZABLE OR NOT TRAZABLE</label>
                      <select value={formData.trazable || ''} onChange={e => setFormData({...formData, trazable: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none text-sm">
                        <option value="SI">SI</option>
                        <option value="NO">NO</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">PHYSICAL / DIGITAL PEDIMENTO</label>
                      <select value={formData.physicalDigitalPedimento || ''} onChange={e => setFormData({...formData, physicalDigitalPedimento: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none text-sm">
                        <option value="DIGITAL">DIGITAL</option>
                        <option value="PHYSICAL">PHYSICAL</option>
                        <option value="BOTH">BOTH</option>
                      </select>
                    </div>

                    <div className="col-span-full">
                      {renderInput('PHYSICAL IDENTIFICATION CUSTOMS INFORMATION', 'physicalIdCustomsInfo')}
                    </div>
                    
                    {renderInput('DOCUMENT', 'document')}
                    {renderInput('ETIQUETA', 'etiqueta')}
                    
                    <div className="col-span-full">
                      <label className="block text-xs font-bold text-slate-600 mb-1">COMMENTS</label>
                      <textarea rows={2} value={formData.comments || ''} onChange={e => setFormData({...formData, comments: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none text-sm resize-y"></textarea>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 border-t border-slate-100 flex justify-end gap-3 sticky bottom-0 z-10 rounded-b-2xl mt-4">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
                    Cancelar
                  </button>
                  <button type="submit" disabled={isSaving} className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50">
                    {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                    {editingAsset ? 'Actualizar AF' : 'Guardar AF'}
                  </button>
                </div>

              </form>
            </div>
          </div>
        </div>
      )}

      {/* Summary / Desglose Modal */}
      {summaryModal.isOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Filter className="text-indigo-600" size={20} />
                  Desglose: {summaryModal.column.toUpperCase()}
                </h3>
                <p className="text-xs text-slate-500 mt-1">Análisis de frecuencias en vista filtrada</p>
              </div>
              <button onClick={() => setSummaryModal({...summaryModal, isOpen: false})} className="text-slate-400 hover:text-slate-600 transition-colors">
                ✕
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto max-h-[60vh] p-0">
              <table className="w-full text-sm text-left">
                <thead className="bg-white sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-6 py-3 font-semibold text-slate-600">Valor Encontrado</th>
                    <th className="px-6 py-3 font-semibold text-slate-600 text-right">Frecuencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr className="bg-slate-50/50 hover:bg-slate-50">
                    <td className="px-6 py-3 font-bold text-slate-700">Σ Total Registros Evaluados</td>
                    <td className="px-6 py-3 text-right font-bold text-blue-600">{summaryModal.totalCount}</td>
                  </tr>
                  {summaryModal.data.map((item, idx) => (
                    <tr 
                      key={idx} 
                      className="hover:bg-indigo-50/50 transition-colors cursor-pointer group"
                      onClick={() => handleFilterByDesglose(item.val)}
                      title={`Haz clic para filtrar la tabla por: ${item.val}`}
                    >
                      <td className="px-6 py-3 text-slate-700 group-hover:text-indigo-700 font-medium">{item.val}</td>
                      <td className="px-6 py-3 text-right">
                        <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-semibold group-hover:bg-indigo-100 group-hover:text-indigo-700">
                          {item.count}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50">
              <button 
                onClick={() => setSummaryModal({...summaryModal, isOpen: false})} 
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors shadow-sm"
              >
                Cerrar Desglose
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Query Builder */}
      <CatalogQueryBuilder 
        isOpen={isQueryBuilderOpen}
        onClose={() => setIsQueryBuilderOpen(false)}
        columns={['mbl', 'containerNumber', 'pedimento', 'htsCode', 'partNumber', 'cfmotoPartNumber', 'materialName', 'physicalSerialNumber', 'localizationPlant', 'countryOrigin']}
        conditions={conditions}
        setConditions={setConditions}
        onApply={() => setIsQueryBuilderOpen(false)}
        onClear={() => setConditions([])}
      />

      {/* Photo Manager Modal */}
      {managingPhotos && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <ImageIcon className="text-indigo-600" size={20} />
                Galería de Fotos - {managingPhotos.mbl || managingPhotos.pedimento}
              </h3>
              <button onClick={() => setManagingPhotos(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                ✕
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Upload Card */}
                <label 
                  onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setIsDraggingOver(false); }}
                  onDrop={async (e) => {
                    e.preventDefault(); 
                    setIsDraggingOver(false);
                    const file = e.dataTransfer?.files?.[0];
                    if (file && !isUploadingPhoto) await processFileUpload(managingPhotos, file);
                  }}
                  className={`border-2 border-dashed rounded-xl transition-colors flex flex-col items-center justify-center p-6 cursor-pointer min-h-[200px] ${isDraggingOver ? 'border-indigo-500 bg-indigo-50 text-indigo-600' : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-500'}`}
                >
                  {isUploadingPhoto ? (
                    <>
                      <Loader2 size={32} className="animate-spin text-indigo-500 mb-2" />
                      <span className="text-sm font-semibold">Subiendo...</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud size={32} className="text-slate-400 mb-2" />
                      <span className="text-sm font-semibold">Agregar Foto o Documento</span>
                      <span className="text-xs text-slate-400 mt-1 text-center">Arrastra, pega (Ctrl+V) o haz clic aquí</span>
                      <input 
                        type="file" 
                        accept="image/*,.pdf" 
                        className="hidden" 
                        onChange={(e) => handleFileUpload(managingPhotos, e)} 
                        disabled={isUploadingPhoto}
                      />
                    </>
                  )}
                </label>

                {/* Display Photos */}
                {(() => {
                  let photosList = managingPhotos.photos || [];
                  if (photosList.length === 0 && managingPhotos.photoUrl && typeof managingPhotos.photoUrl === 'string' && managingPhotos.photoUrl !== '[object Object]') {
                    photosList = [{
                      id: 'legacy',
                      url: managingPhotos.photoUrl,
                      uploadedBy: managingPhotos.photoUploadedBy || 'sistema',
                      uploadedAt: managingPhotos.photoUploadedAt || ''
                    }];
                  }

                  return photosList.map(photo => (
                    <div key={photo.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm group relative">
                      <div className="h-48 bg-slate-100 relative">
                        <img 
                          src={getDriveDirectUrl(photo.url)} 
                          alt="Activo" 
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            if (!target.src.includes('preview')) {
                              const match = photo.url.match(/\/d\/([a-zA-Z0-9_-]+)/);
                              if (match && match[1]) {
                                target.outerHTML = `
                                  <div style="width: 100%; height: 100%; overflow: hidden; position: relative;">
                                    <iframe src="https://drive.google.com/file/d/${match[1]}/preview" style="position: absolute; top: -60px; left: 0; width: 100%; height: calc(100% + 60px); border: 0;"></iframe>
                                  </div>
                                `;
                              }
                            }
                          }}
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-sm">
                          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setViewingPhoto(photo.url); }} className="bg-white text-slate-800 p-2 rounded-lg hover:bg-slate-100 shadow-lg transition-transform hover:scale-105" title="Ver en Pantalla Completa">
                            <Maximize size={18} />
                          </button>
                          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeletePhoto(managingPhotos, photo.id); }} className="bg-red-500 text-white p-2 rounded-lg hover:bg-red-600 shadow-lg transition-transform hover:scale-105" title="Eliminar">
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                      <div className="p-3 text-xs text-slate-500">
                        <p className="truncate"><span className="font-semibold text-slate-700">Por:</span> {photo.uploadedBy}</p>
                        {photo.uploadedAt && <p><span className="font-semibold text-slate-700">Fecha:</span> {new Date(photo.uploadedAt).toLocaleString()}</p>}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
            
            <div className="px-6 py-4 bg-white border-t border-slate-200 flex justify-end">
              <button onClick={() => setManagingPhotos(null)} className="px-6 py-2 bg-indigo-600 text-white font-bold hover:bg-indigo-700 rounded-xl transition-colors shadow-md text-sm">
                Cerrar Galería
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Screen Photo/PDF Viewer Modal */}
      {viewingPhoto && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/95 p-4 md:p-8" onClick={() => setViewingPhoto(null)}>
          <div className="relative w-full max-w-[95vw] h-[95vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
            
            {/* Controles Top */}
            <div className="w-full flex justify-end mb-3">
              <button onClick={() => setViewingPhoto(null)} className="bg-red-600 hover:bg-red-700 text-white font-bold text-sm flex items-center gap-2 px-6 py-2.5 rounded-xl transition-all shadow-lg border border-red-500">
                ✕ Cerrar Vista
              </button>
            </div>
            
            {/* Contenedor principal de visualización */}
            <div className="w-full flex-1 flex items-center justify-center bg-slate-900/50 rounded-2xl overflow-hidden shadow-2xl border border-white/10">
              <img 
                src={getDriveDirectUrl(viewingPhoto)} 
                alt="Vista Documento" 
                className="max-w-full max-h-full object-contain select-none" 
                onContextMenu={e => e.preventDefault()}
                onError={(e) => {
                  // Si no es imagen (PDF o error Drive), cambiamos al iframe preview pero RECORTANDO la barra de Google Drive
                  const target = e.target as HTMLImageElement;
                  if (!target.src.includes('preview')) {
                    const match = viewingPhoto.match(/\/d\/([a-zA-Z0-9_-]+)/);
                    if (match && match[1]) {
                      target.outerHTML = `
                        <div style="width: 100%; height: 100%; overflow: hidden; position: relative; border-radius: 1rem;">
                          <iframe src="https://drive.google.com/file/d/${match[1]}/preview" style="position: absolute; top: -60px; left: 0; width: 100%; height: calc(100% + 60px); border: 0;"></iframe>
                        </div>
                      `;
                    }
                  }
                }}
              />
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
