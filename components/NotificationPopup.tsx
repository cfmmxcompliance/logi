import React from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';

export const NotificationPopup: React.FC = () => {
    const { notification, hideNotification } = useNotification();

    if (!notification.isOpen) return null;

    const getIcon = () => {
        switch (notification.type) {
            case 'success': return <CheckCircle size={32} className="text-emerald-500" />;
            case 'error': return <AlertCircle size={32} className="text-red-500" />;
            case 'warning': return <AlertTriangle size={32} className="text-amber-500" />;
            default: return <Info size={32} className="text-blue-500" />;
        }
    };

    const getBgColor = () => {
        switch (notification.type) {
            case 'success': return 'bg-emerald-50 border-emerald-100';
            case 'error': return 'bg-red-50 border-red-100';
            case 'warning': return 'bg-amber-50 border-amber-100';
            default: return 'bg-blue-50 border-blue-100';
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className={`relative w-full max-w-md p-6 rounded-2xl shadow-2xl border ${getBgColor()} bg-white transform transition-all scale-100`}>
                <button
                    onClick={hideNotification}
                    className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
                >
                    <X size={20} />
                </button>

                <div className="flex flex-col items-center text-center space-y-4">
                    <div className={`p-3 rounded-full bg-white shadow-sm`}>
                        {getIcon()}
                    </div>

                    <div>
                        <h3 className="text-lg font-bold text-slate-800 mb-1">
                            {notification.title}
                        </h3>
                        <p className="text-slate-600 leading-relaxed">
                            {notification.message}
                        </p>
                    </div>

                    <button
                        onClick={hideNotification}
                        className="mt-2 w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors shadow-sm"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};
