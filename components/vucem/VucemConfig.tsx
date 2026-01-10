
import React, { useState, useEffect } from 'react';
import { VucemConfig } from '../../services/vucem/types';

interface Props {
    onConfigSave: (config: VucemConfig) => void;
    currentConfig?: VucemConfig | null;
}

export const VucemConfigComponent: React.FC<Props> = ({ onConfigSave, currentConfig }) => {
    const [rfc, setRfc] = useState(currentConfig?.rfc || '');
    const [password, setPassword] = useState('');
    const [keyFile, setKeyFile] = useState<File | null>(null);
    const [cerFile, setCerFile] = useState<File | null>(null);

    const handleSave = () => {
        if (!rfc || !password || !keyFile || !cerFile) {
            alert("Todos los campos son requeridos para configurar la FIEL.");
            return;
        }
        onConfigSave({ rfc, password, keyFile, cerFile });
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-xl font-bold mb-4 text-slate-800 flex items-center gap-2">
                <span className="text-blue-600">🔑</span> Configuración de FIEL
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">RFC</label>
                    <input
                        type="text"
                        value={rfc}
                        onChange={e => setRfc(e.target.value.toUpperCase())}
                        className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        placeholder="RFC del Contribuyente"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña de Clave Privada</label>
                    <input
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        placeholder="••••••••"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Archivo .KEY (Clave Privada)</label>
                    <input
                        type="file"
                        accept=".key"
                        onChange={e => setKeyFile(e.target.files?.[0] || null)}
                        className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Archivo .CER (Certificado)</label>
                    <input
                        type="file"
                        accept=".cer"
                        onChange={e => setCerFile(e.target.files?.[0] || null)}
                        className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                </div>
            </div>

            <div className="mt-6 flex justify-end">
                <button
                    onClick={handleSave}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 shadow transition-colors font-medium flex items-center gap-2"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
                    Guardar Configuración
                </button>
            </div>
        </div>
    );
};
