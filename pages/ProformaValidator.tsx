import React, { useState } from 'react';
import { ProformaValidatorV1 } from './ProformaValidatorV1';
import { ProformaValidatorV2 } from './ProformaValidatorV2';

export const ProformaValidator = () => {
    const [activeTab, setActiveTab] = useState<'V2' | 'V1'>('V2');

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-slate-800">
                    Proforma Validator
                </h1>
                
                {/* Tabs */}
                <div className="flex bg-slate-100 p-1 rounded-lg">
                    <button
                        onClick={() => setActiveTab('V2')}
                        className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${
                            activeTab === 'V2' 
                                ? 'bg-white text-blue-600 shadow-sm' 
                                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
                        }`}
                    >
                        Validación Cruzada (V2)
                    </button>
                    <button
                        onClick={() => setActiveTab('V1')}
                        className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${
                            activeTab === 'V1' 
                                ? 'bg-white text-indigo-600 shadow-sm' 
                                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
                        }`}
                    >
                        Análisis IA (V1)
                    </button>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 min-h-[600px]">
                {activeTab === 'V2' ? <ProformaValidatorV2 /> : <ProformaValidatorV1 />}
            </div>
        </div>
    );
};
