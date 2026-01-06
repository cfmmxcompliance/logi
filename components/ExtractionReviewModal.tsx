import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';
import { CostRecord } from '../types';

interface ExtractionReviewModalProps {
    isOpen: boolean;
    items: CostRecord[];
    onSave: (trimmedItems: CostRecord[]) => void;
    onCancel: () => void;
}

export const ExtractionReviewModal: React.FC<ExtractionReviewModalProps> = ({
    isOpen, items, onSave, onCancel
}) => {
    const [reviewedItems, setReviewedItems] = useState<CostRecord[]>([]);

    useEffect(() => {
        if (isOpen) {
            // Mantenemos el objeto íntegro (...i)
            // Force type to empty string to ensure manual selection
            setReviewedItems(items.map(i => ({
                ...i,
                type: i.type || '',
                aaRef: i.aaRef || '' // Inicializamos aaRef para que el input sea controlado desde el inicio 
            })));
        }
    }, [isOpen, items]);

    const handleConfirm = () => {
        const missingType = reviewedItems.some(item => !item.type);
        if (missingType) {
            window.alert("SELECCION OBLIGATORIA: Por favor seleccione un Tipo para todos los registros antes de guardar.");
            return;
        }
        onSave(reviewedItems);
    };

    if (!isOpen) return null;

    const handleChange = (id: string, field: 'extractedBl' | 'linkedContainer' | 'currency' | 'comments' | 'type' | 'aaRef', value: string) => {
        setReviewedItems(prev => prev.map(item =>
            item.id === id ? { ...item, [field]: value } : item
        ));
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="bg-white border-b border-slate-100 p-6 flex justify-between items-center bg-gradient-to-r from-blue-50 to-white">
                    <div>
                        <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            Review Extracted Data
                        </h3>
                        <p className="text-slate-500 text-sm mt-1">
                            Please verify the extracted Bill of Lading and Containers before saving.
                        </p>
                    </div>
                    <button
                        onClick={onCancel}
                        className="text-slate-400 hover:text-slate-600 transition-colors p-2 hover:bg-slate-100 rounded-full"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Body - List of Items */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/50">
                    {reviewedItems.map((item, index) => (
                        <div key={item.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex justify-between items-start mb-3 border-b border-slate-50 pb-2">
                                <span className="font-bold text-slate-700 text-sm flex items-center gap-2">
                                    <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded textxs">#{index + 1}</span>
                                    {item.xmlFile}
                                </span>
                                <span className="font-mono text-xs text-slate-400">{item.invoiceNo}</span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                                {/* BL Input */}
                                <div className="md:col-span-4">
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                                        Bill of Lading (BL)
                                    </label>
                                    <input
                                        type="text"
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono tracking-wide"
                                        value={item.extractedBl || ''}
                                        onChange={(e) => handleChange(item.id, 'extractedBl', e.target.value.toUpperCase())}
                                        placeholder="Enter BL Number"
                                    />
                                </div>

                                {/* Type Input */}
                                <div className="md:col-span-3">
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                                        Type
                                    </label>
                                    <select
                                        className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none ${!item.type ? 'border-red-300 ring-2 ring-red-100 bg-red-50' : 'border-slate-300 focus:ring-blue-500 focus:border-blue-500 bg-white'}`}
                                        value={item.type || ''}
                                        onChange={(e) => handleChange(item.id, 'type', e.target.value)}
                                    >
                                        <option value="" disabled>SELECCION OBLIGATORIA</option>
                                        <option value="PREPAYMENTS">PREPAYMENTS</option>
                                        <option value="INLAND">INLAND</option>
                                        <option value="BROKER">BROKER</option>
                                        <option value="AIR">AIR</option>
                                        {/* Legacy Options */}
                                        <option value="Freight">Freight</option>
                                        <option value="Customs">Customs</option>
                                        <option value="Transport">Transport</option>
                                        <option value="Handling">Handling</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>

                                {/* Currency Input */}
                                <div className="md:col-span-1">
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                                        Currency
                                    </label>
                                    <input
                                        type="text"
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono tracking-wide text-center"
                                        value={item.currency || ''}
                                        onChange={(e) => handleChange(item.id, 'currency', e.target.value.toUpperCase())}
                                        placeholder="USD/MXN"
                                    />
                                </div>

                                {/* AARef Input (Conditional) */}
                                {item.type === 'BROKER' && (
                                    <div className="md:col-span-4 animate-in fade-in slide-in-from-left-4 duration-300">
                                        <label className="block text-xs font-bold text-blue-600 uppercase mb-1">
                                            AA Reference (Ref. Operativa)
                                        </label>
                                        <input
                                            type="text"
                                            className="w-full border border-blue-200 bg-blue-50 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono tracking-wide"
                                            value={item.aaRef || ''}
                                            maxLength={20}
                                            onChange={(e) => handleChange(item.id, 'aaRef', e.target.value)}
                                            placeholder="AA Ref (Max 20)"
                                        />
                                    </div>
                                )}

                                {/* Comments Input */}
                                <div className="md:col-span-12">
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                                        Description / Comments
                                    </label>
                                    <input
                                        type="text"
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                        value={item.comments || ''}
                                        onChange={(e) => handleChange(item.id, 'comments', e.target.value)}
                                        placeholder="Description"
                                    />
                                </div>

                                {/* Container Input */}
                                <div className="md:col-span-4">
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                                        Containers
                                    </label>
                                    <input
                                        type="text"
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono tracking-wide"
                                        value={item.linkedContainer || ''}
                                        onChange={(e) => handleChange(item.id, 'linkedContainer', e.target.value.toUpperCase())}
                                        placeholder="Container Number(s)"
                                    />
                                </div>
                            </div>

                            {(!item.extractedBl && !item.linkedContainer) && (
                                <div className="mt-2 text-xs text-amber-600 flex items-center gap-1">
                                    <AlertCircle size={12} />
                                    <span>Warning: No data extracted. Please enter manually if available.</span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Footer Actions */}
                <div className="p-6 border-t border-slate-100 bg-white flex justify-end gap-3 rounded-b-xl">
                    <button
                        onClick={onCancel}
                        className="px-5 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        Discard & Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-bold shadow-md hover:bg-blue-700 hover:shadow-lg transition-all flex items-center gap-2"
                    >
                        <Save size={18} />
                        Confirm & Save {reviewedItems.length} Record{reviewedItems.length !== 1 ? 's' : ''}
                    </button>
                </div>
            </div>
        </div>
    );
};
