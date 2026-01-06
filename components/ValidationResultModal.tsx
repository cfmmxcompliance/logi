import React from 'react';
import { XCircle, CheckCircle, AlertTriangle, X } from 'lucide-react';

interface ValidationResultModalProps {
    isOpen: boolean;
    onClose: () => void;
    successCount: number;
    totalFiles: number;
    errors: string[];
}

export const ValidationResultModal: React.FC<ValidationResultModalProps> = ({
    isOpen,
    onClose,
    successCount,
    totalFiles,
    errors
}) => {
    if (!isOpen) return null;

    const hasErrors = errors.length > 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">

                {/* Header */}
                <div className={`px-6 py-4 flex items-center justify-between ${hasErrors ? 'bg-amber-50' : 'bg-green-50'}`}>
                    <div className="flex items-center gap-3">
                        {hasErrors ? (
                            <div className="p-2 bg-amber-100 rounded-full text-amber-600">
                                <AlertTriangle size={24} />
                            </div>
                        ) : (
                            <div className="p-2 bg-green-100 rounded-full text-green-600">
                                <CheckCircle size={24} />
                            </div>
                        )}
                        <div>
                            <h3 className={`text-lg font-bold ${hasErrors ? 'text-amber-900' : 'text-green-900'}`}>
                                {hasErrors ? 'Proceso Completado con Alertas' : 'Proceso Exitoso'}
                            </h3>
                            <p className="text-sm text-gray-600">
                                Se procesaron {successCount} de {totalFiles} archivos.
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 max-h-[60vh] overflow-y-auto">
                    {hasErrors ? (
                        <div className="space-y-4">
                            <div className="p-3 bg-red-50 border border-red-100 rounded-lg">
                                <h4 className="text-sm font-bold text-red-800 mb-2 flex items-center gap-2">
                                    <XCircle size={16} />
                                    Errores / Alertas ({errors.length})
                                </h4>
                                <ul className="space-y-2">
                                    {errors.map((err, idx) => (
                                        <li key={idx} className="text-xs text-red-700 font-mono bg-white p-2 rounded border border-red-100 shadow-sm break-all">
                                            {err}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <p className="text-xs text-gray-500 text-center">
                                Por favor revisa los archivos indicados manualmente.
                            </p>
                        </div>
                    ) : (
                        <div className="text-center py-8 text-gray-500">
                            <p>Todos los archivos fueron procesados y guardados correctamente.</p>
                            <p className="text-xs mt-2">No se encontraron errores de extracción.</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors shadow-sm"
                    >
                        Entendido
                    </button>
                </div>
            </div>
        </div>
    );
};
