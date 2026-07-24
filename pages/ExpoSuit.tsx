import React, { useState } from 'react';
import { Package, FileText } from 'lucide-react';
import { XMLInvoiceExtractor as XMLInvoiceExtractorV01 } from './XMLInvoiceExtractorV01.tsx';
import { XMLCI as XMLCIV01 } from './XMLCIV01.tsx';

const ExpoSuit = () => {
    const [activeTab, setActiveTab] = useState<'extractor' | 'ci'>('extractor');

    return (
        <div className="h-full flex flex-col bg-slate-50">
            {/* Header and Tabs */}
            <div className="bg-white border-b border-slate-200 px-6 pt-4 shrink-0 shadow-sm z-10">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h1 className="text-2xl font-black text-slate-800 tracking-tight">ExpoSuit</h1>
                        <p className="text-slate-500 text-sm">Targeted Fetch Suite for XML Invoices and CI Records</p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 border-b border-slate-200">
                    <button
                        onClick={() => setActiveTab('extractor')}
                        className={`flex items-center gap-2 px-6 py-3 border-b-2 font-medium text-sm transition-colors ${
                            activeTab === 'extractor'
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                        }`}
                    >
                        <FileText size={18} />
                        XML Invoice Extractor V.01
                    </button>
                    <button
                        onClick={() => setActiveTab('ci')}
                        className={`flex items-center gap-2 px-6 py-3 border-b-2 font-medium text-sm transition-colors ${
                            activeTab === 'ci'
                                ? 'border-emerald-600 text-emerald-600'
                                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                        }`}
                    >
                        <Package size={18} />
                        XMLCI (Consolidated) V.01
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 min-h-0">
                <div className={activeTab === 'extractor' ? 'h-full' : 'hidden'}>
                    <XMLInvoiceExtractorV01 />
                </div>
                <div className={activeTab === 'ci' ? 'h-full' : 'hidden'}>
                    <XMLCIV01 />
                </div>
            </div>
        </div>
    );
};

export default ExpoSuit;
