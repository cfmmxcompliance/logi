
import React, { useState, useEffect } from 'react';
import { VucemConfigComponent } from '../components/vucem/VucemConfig';
import { EdocumentQuery } from '../components/vucem/EdocumentQuery';
import { VucemConfig } from '../services/vucem/types';

export const Vucem: React.FC = () => {
    const [config, setConfig] = useState<VucemConfig | null>(null);
    const [activeTab, setActiveTab] = useState<'config' | 'query'>('config');

    const handleConfigSave = (newConfig: VucemConfig) => {
        setConfig(newConfig);
        setActiveTab('query');
        // Ideally save to Context or LocalStorage (excluding File objects)
        // For security, File objects must be re-selected on refresh in this basic version.
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8">
            {/* Header / Intro */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Conexión VUCEM</h1>
                    <p className="text-slate-500 mt-1">Consulta de Edocuments y COVEs directamente desde la Ventanilla Única.</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-slate-200">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    <button
                        onClick={() => setActiveTab('config')}
                        className={`${activeTab === 'config'
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2`}
                    >
                        <span className="text-lg">⚙️</span> Configuración
                    </button>
                    <button
                        onClick={() => setActiveTab('query')}
                        className={`${activeTab === 'query'
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2`}
                    >
                        <span className="text-lg">🔎</span> Consulta Edocument
                    </button>
                </nav>
            </div>

            {/* Content */}
            <div className="mt-6">
                {activeTab === 'config' && (
                    <VucemConfigComponent onConfigSave={handleConfigSave} currentConfig={config} />
                )}

                {activeTab === 'query' && (
                    <EdocumentQuery config={config} />
                )}
            </div>

            {/* Info Box */}
            <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-lg">
                <div className="flex">
                    <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <div className="ml-3">
                        <p className="text-sm text-amber-700">
                            <strong>Nota de Seguridad:</strong> Los archivos de su FIEL (.key y .cer) se procesan localmente en su navegador para firmar las peticiones. No se almacenan permanentemente en el servidor.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
