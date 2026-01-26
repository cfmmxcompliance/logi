import React, { useState, useEffect } from 'react';
import { VucemConfig } from '../../services/vucem/types';
import { vucemStorage } from '../../services/vucem/vucemStorage';

interface Props {
    onConfigSave: (config: VucemConfig) => void;
    currentConfig?: VucemConfig | null;
}

export const VucemConfigComponent: React.FC<Props> = ({ onConfigSave, currentConfig }) => {
    const [rfc, setRfc] = useState(currentConfig?.rfc || '');
    const [password, setPassword] = useState(''); // FIEL Key Password
    const [webServicePassword, setWebServicePassword] = useState(''); // VUCEM Web Service Password
    const [keyFile, setKeyFile] = useState<File | null>(null);
    const [cerFile, setCerFile] = useState<File | null>(null);
    const [remember, setRemember] = useState(currentConfig?.remember || false);

    useEffect(() => {
        if (currentConfig) {
            setRfc(currentConfig.rfc);
            setRemember(currentConfig.remember || false);
        }
    }, [currentConfig]);

    const handleSave = async () => {
        if (!rfc || !password || !keyFile || !cerFile) {
            alert("El RFC, la contraseña de la FIEL y los archivos (.key y .cer) son obligatorios.");
            return;
        }

        if (remember) {
            await vucemStorage.saveFiles(keyFile, cerFile);
            vucemStorage.saveMeta({ rfc, password, webServicePassword, remember: true });
        } else {
            vucemStorage.saveMeta({ rfc: '', remember: false });
        }

        onConfigSave({ rfc, password, webServicePassword, keyFile, cerFile, remember });
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
                    <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña de Clave Privada (FIEL .key)</label>
                    <input
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        placeholder="Contraseña del archivo .key"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña Web Service VUCEM</label>
                    <input
                        type="password"
                        value={webServicePassword}
                        onChange={e => setWebServicePassword(e.target.value)}
                        className="w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 border-l-4 border-l-indigo-400"
                        placeholder="Contraseña del usuario de VUCEM"
                        title="Es diferente a la de la FIEL. Es con la que entras a la página de Ventanilla Única."
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

            <div className="mt-6 flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                        type="checkbox"
                        checked={remember}
                        onChange={e => setRemember(e.target.checked)}
                        className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 transition-all"
                    />
                    <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-700 group-hover:text-blue-600 transition-colors">Recordar mis archivos y contraseñas</span>
                        <span className="text-[10px] text-slate-400">La información se guardará de forma segura en este navegador.</span>
                    </div>
                </label>
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
