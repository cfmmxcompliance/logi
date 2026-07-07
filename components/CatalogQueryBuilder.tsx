import React from 'react';
import { X, Trash2, Plus, RotateCcw, Search, Database } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export interface QueryCondition {
    id: string;
    column: string;
    operator: string;
    type: 'string' | 'number' | 'boolean';
    input: string;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    columns: string[];
    conditions: QueryCondition[];
    setConditions: (c: QueryCondition[]) => void;
    onApply: () => void;
    onClear: () => void;
}

export const CatalogQueryBuilder: React.FC<Props> = ({ isOpen, onClose, columns, conditions, setConditions, onApply, onClear }) => {
    const { t } = useLanguage();
    if (!isOpen) return null;

    const addCondition = () => {
        setConditions([
            ...conditions,
            { id: Math.random().toString(), column: columns[0] || '', operator: 'in', type: 'string', input: '' }
        ]);
    };

    const removeCondition = (id: string) => {
        if (conditions.length === 1) return;
        setConditions(conditions.filter(c => c.id !== id));
    };

    const updateCondition = (id: string, updates: Partial<QueryCondition>) => {
        setConditions(conditions.map(c =>
            c.id === id ? { ...c, ...updates } : c
        ));
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                <div className="bg-slate-50 p-6 border-b border-slate-100 flex justify-between items-center">
                    <div>
                        <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <Database size={22} className="text-indigo-600" />
                            {t('qb.title')}
                        </h3>
                        <p className="text-sm text-slate-500 mt-1">{t('qb.subtitle')}</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700 bg-white shadow-sm border border-slate-200 p-1.5 rounded-lg transition-colors"><X size={20} /></button>
                </div>

                <div className="p-6 flex-1 overflow-y-auto space-y-6">
                    {conditions.map((cond, index) => (
                        <div key={cond.id} className="p-5 bg-white rounded-xl border border-slate-200 relative group animate-in slide-in-from-top-2 duration-200 shadow-sm">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-6 h-6 rounded border border-indigo-200 bg-indigo-50 text-indigo-700 flex items-center justify-center text-xs font-bold">
                                    {index + 1}
                                </div>
                                <div className="h-px flex-1 bg-slate-100"></div>
                                {conditions.length > 1 && (
                                    <button
                                        onClick={() => removeCondition(cond.id)}
                                        className="text-slate-400 hover:text-red-600 bg-white hover:bg-red-50 p-1.5 rounded-lg border border-transparent hover:border-red-100 transition-colors"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{t('qb.column')}</label>
                                    <select
                                        className="w-full border border-slate-300 rounded-lg p-2.5 text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                        value={cond.column}
                                        onChange={(e) => updateCondition(cond.id, { column: e.target.value })}
                                    >
                                        {columns.map(key => (
                                            <option key={key} value={key}>{key}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{t('qb.operator')}</label>
                                    <select
                                        className="w-full border border-slate-300 rounded-lg p-2.5 text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                        value={cond.operator}
                                        onChange={(e) => updateCondition(cond.id, { operator: e.target.value })}
                                    >
                                        <option value="in">{t('qb.op_in')}</option>
                                        <option value="==">{t('qb.op_eq')}</option>
                                        <option value="!=">{t('qb.op_neq')}</option>
                                        <option value="contains">{t('qb.op_contains')}</option>
                                        <option value="not_contains">{t('qb.op_notcontains')}</option>
                                        <option value="empty">{t('qb.op_empty')}</option>
                                        <option value="not_empty">{t('qb.op_notempty')}</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{t('qb.datatype')}</label>
                                    <select
                                        className="w-full border border-slate-300 rounded-lg p-2.5 text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50 disabled:bg-slate-100 transition-all"
                                        value={cond.type}
                                        disabled={cond.operator === 'empty' || cond.operator === 'not_empty'}
                                        onChange={(e) => updateCondition(cond.id, { type: e.target.value as any })}
                                    >
                                        <option value="string">{t('qb.type_string')}</option>
                                        <option value="number">{t('qb.type_number')}</option>
                                        <option value="boolean">{t('qb.type_boolean')}</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                                    {cond.operator === 'empty' || cond.operator === 'not_empty'
                                        ? t('qb.val_noreq')
                                        : cond.operator === 'in' ? t('qb.val_list') : t('qb.val_target')
                                    }
                                </label>
                                <textarea
                                    className="w-full border border-slate-300 rounded-lg p-3 font-mono text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none min-h-[80px] disabled:bg-slate-100 disabled:text-slate-400 bg-slate-50 focus:bg-white transition-all shadow-inner"
                                    placeholder={cond.operator === 'empty' || cond.operator === 'not_empty' ? "N/A" : cond.operator === 'in' ? t('qb.placeholder_in') : t('qb.placeholder_val')}
                                    value={cond.operator === 'empty' || cond.operator === 'not_empty' ? '' : cond.input}
                                    disabled={cond.operator === 'empty' || cond.operator === 'not_empty'}
                                    onChange={(e) => updateCondition(cond.id, { input: e.target.value })}
                                />
                            </div>
                        </div>
                    ))}

                    <button
                        onClick={addCondition}
                        className="w-full py-4 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 hover:text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50 transition-all flex items-center justify-center gap-2 font-semibold"
                    >
                        <Plus size={20} /> {t('qb.add_condition')}
                    </button>
                </div>

                <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-between items-center rounded-b-2xl">
                    <button
                        onClick={onClear}
                        className="text-red-500 hover:text-red-700 font-bold text-sm flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-red-50 transition-colors"
                    >
                        <RotateCcw size={16} /> {t('qb.reset')}
                    </button>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-50 font-semibold shadow-sm transition-all focus:ring-2 focus:ring-slate-200">{t('qb.cancel')}</button>
                        <button
                            onClick={onApply}
                            className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-bold shadow-lg shadow-indigo-500/30 transition-all flex items-center gap-2 focus:ring-4 focus:ring-indigo-500/30"
                        >
                            <Search size={18} /> {t('qb.apply')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export function evaluateCondition(val: any, cond: QueryCondition): boolean {
    const sVal = String(val || '');
    const numVal = Number(val);
    const target = cond.input;
    const sTarget = String(target);
    const numTarget = Number(target);

    if (cond.operator === 'empty') return sVal.trim() === '' || val == null;
    if (cond.operator === 'not_empty') return sVal.trim() !== '' && val != null;

    const inputLines = target.split(/[\r\n,;\\t]+/).map(t => t.trim()).filter(t => t);
    if (inputLines.length === 0) return true;

    if (cond.operator === 'in') {
        const targets = inputLines.map(t => t.toLowerCase());
        return targets.includes(sVal.toLowerCase());
    }

    const matchesLine = (line: string) => {
        const sTarget = String(line);
        const numTarget = Number(line);
        switch (cond.operator) {
            case '==': 
                if (cond.type === 'number') return numVal === numTarget;
                return sVal.toLowerCase() === sTarget.toLowerCase();
            case '!=': 
                if (cond.type === 'number') return numVal !== numTarget;
                return sVal.toLowerCase() !== sTarget.toLowerCase();
            case 'contains': return sVal.toLowerCase().includes(sTarget.toLowerCase());
            case 'not_contains': return !sVal.toLowerCase().includes(sTarget.toLowerCase());
            default: return true;
        }
    };

    if (cond.operator === '!=' || cond.operator === 'not_contains') {
        return inputLines.every(matchesLine);
    } else {
        return inputLines.some(matchesLine);
    }
}
