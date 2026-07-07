import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../context/useAuth';
import { UserRole } from '../types.ts';
import { storage } from '../services/firebaseConfig.ts';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Search, Copy, AlertTriangle, BookOpen, CheckCircle2, DownloadCloud, Loader2 } from 'lucide-react';

interface CatPySRecord {
    c: string; // clave (e.g. 43191501)
    d: string; // descripcion
}

export const CatalogoSAT: React.FC = () => {
    const { user } = useAuth();
    const [catalog, setCatalog] = useState<CatPySRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const STORAGE_PATH = 'system/catpys.json';

    useEffect(() => {
        fetchCatalog();
    }, []);

    const fetchCatalog = async () => {
        setLoading(true);
        try {
            const fileRef = ref(storage, STORAGE_PATH);
            
            // Add a 5 second timeout to prevent infinite loading if Firebase hangs
            const url = await Promise.race([
                getDownloadURL(fileRef),
                new Promise<string>((_, reject) => setTimeout(() => reject(new Error("Timeout de red en Firebase Storage")), 5000))
            ]);

            const response = await fetch(url);
            if (!response.ok) throw new Error("Error HTTP al descargar el catálogo");
            
            const data = await response.json();
            if (Array.isArray(data)) {
                setCatalog(data);
            }
        } catch (error: any) {
            console.warn("No se pudo cargar el catálogo SAT. Puede que no exista aún.", error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSyncFromPublicSource = async () => {
        if (user?.role !== UserRole.ADMIN) {
            alert("Solo los administradores pueden actualizar el catálogo.");
            return;
        }

        if (!window.confirm("Se descargará la versión más reciente del catálogo del SAT desde un repositorio público (aprox. 18MB) y se sincronizará a tu base de datos en la nube. ¿Deseas continuar?")) {
            return;
        }

        setUploading(true);
        try {
            // BambuCode maintains an open source JSON mapping of SAT catalogs updated regularly
            const response = await fetch('https://raw.githubusercontent.com/bambucode/catalogos_sat_JSON/master/c_ClaveProdServ.json');
            if (!response.ok) throw new Error("No se pudo conectar a la fuente pública.");
            
            const rawData = await response.json();
            
            const parsedRecords: CatPySRecord[] = [];
            
            for (let i = 0; i < rawData.length; i++) {
                const item = rawData[i];
                if (item && item.id && item.descripcion) {
                    const clave = String(item.id).trim();
                    const descripcion = String(item.descripcion).trim();

                    // Valid SAT ClaveProdServ is exactly 8 digits
                    if (/^\d{8}$/.test(clave)) {
                        parsedRecords.push({ c: clave, d: descripcion });
                    }
                }
            }

            if (parsedRecords.length === 0) {
                alert("No se encontraron claves válidas en la fuente.");
                setUploading(false);
                return;
            }

            // Upload to Firebase Storage as JSON
            console.log("Datos filtrados, tamaño de array:", parsedRecords.length);
            
            const jsonString = JSON.stringify(parsedRecords);
            const blob = new Blob([jsonString], { type: 'application/json' });
            
            const fileRef = ref(storage, STORAGE_PATH);
            console.log("Iniciando carga a Firebase Storage...");
            await uploadBytes(fileRef, blob, { contentType: 'application/json' });
            
            console.log("Carga completada.");
            alert(`Sincronización completa. Se cargaron ${parsedRecords.length} claves.`);
            // Fetch updated catalog to show
            await fetchCatalog();
        } catch (error: any) {
            console.error("Error sincronizando:", error);
            alert(`Error sincronizando el catálogo: ${error.message || error}`);
        } finally {
            setUploading(false);
        }
    };

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(text);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const filteredCatalog = useMemo(() => {
        if (!searchTerm) return [];
        const terms = searchTerm.toLowerCase().split(' ').filter(t => t);
        
        // For performance, limit results to 100 items
        const results = [];
        for (let i = 0; i < catalog.length; i++) {
            const item = catalog[i];
            const searchStr = `${item.c} ${item.d}`.toLowerCase();
            const matches = terms.every(t => searchStr.includes(t));
            
            if (matches) {
                results.push(item);
                if (results.length >= 100) break;
            }
        }
        return results;
    }, [catalog, searchTerm]);

    return (
        <div className="w-full space-y-6 animate-in fade-in duration-300">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-amber-500 rounded-xl flex items-center justify-center text-white shadow-lg">
                        <BookOpen size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Catálogo de Productos y Servicios (SAT)</h1>
                        <p className="text-sm text-slate-500">Buscador interno de claves c_ClaveProdServ para CFDI.</p>
                    </div>
                </div>
                
                {user?.role === UserRole.ADMIN && (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleSyncFromPublicSource}
                            disabled={uploading}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-xl hover:bg-slate-900 shadow-md font-medium disabled:opacity-50 transition-all"
                        >
                            {uploading ? <Loader2 size={16} className="animate-spin" /> : <DownloadCloud size={16} />}
                            {uploading ? 'Sincronizando...' : 'Sincronizar Catálogo Oficial'}
                        </button>
                    </div>
                )}
            </div>

            {/* Status & Search Area */}
            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-slate-50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                
                <div className="relative z-10 max-w-3xl mx-auto space-y-6">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-3">
                            <Loader2 size={32} className="animate-spin text-amber-500" />
                            <p className="font-medium">Cargando base de datos del SAT...</p>
                        </div>
                    ) : catalog.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-3">
                            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-2">
                                <AlertTriangle className="text-red-400" size={24} />
                            </div>
                            <p className="font-semibold text-slate-700">Catálogo No Disponible</p>
                            <p className="text-sm text-center max-w-md">El sistema aún no cuenta con el catálogo del SAT cargado.<br />Da clic en el botón superior para descargar la versión más reciente.</p>
                        </div>
                    ) : (
                        <>
                            <div className="text-center">
                                <h2 className="text-2xl font-black text-slate-800 mb-2">Buscador catPyS</h2>
                                <p className="text-slate-500 text-sm">
                                    Base de datos cargada con <span className="font-bold text-slate-700">{catalog.length.toLocaleString()}</span> claves activas.
                                </p>
                            </div>

                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={24} />
                                <input
                                    type="text"
                                    placeholder="Buscar por descripción, palabra clave o código (ej. celular, 43191501)..."
                                    className="w-full pl-14 pr-6 py-4 bg-slate-50 border-2 border-slate-200 rounded-2xl text-lg font-medium text-slate-800 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 transition-all outline-none"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    autoFocus
                                />
                            </div>

                            {!searchTerm ? (
                                <div className="text-center py-8 text-slate-400 italic">
                                    Ingresa un término para comenzar a buscar...
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="flex justify-between items-end mb-2">
                                        <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">Resultados ({filteredCatalog.length}{filteredCatalog.length === 100 ? '+' : ''})</span>
                                    </div>
                                    
                                    {filteredCatalog.length === 0 ? (
                                        <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-500">
                                            No se encontraron resultados para "{searchTerm}"
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 gap-3">
                                            {filteredCatalog.map((item) => (
                                                <div key={item.c} className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl hover:border-amber-300 hover:shadow-md transition-all group">
                                                    <div className="flex items-start gap-4">
                                                        <div className="bg-amber-50 text-amber-700 font-mono font-bold px-3 py-1.5 rounded-lg border border-amber-200">
                                                            {item.c}
                                                        </div>
                                                        <div className="pt-1">
                                                            <p className="font-medium text-slate-800 leading-snug">{item.d}</p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleCopy(item.c)}
                                                        className={`shrink-0 flex items-center justify-center w-10 h-10 rounded-lg transition-colors ${copiedId === item.c ? 'bg-emerald-500 text-white' : 'bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-700'}`}
                                                        title="Copiar Clave"
                                                    >
                                                        {copiedId === item.c ? <CheckCircle2 size={20} /> : <Copy size={20} />}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CatalogoSAT;
