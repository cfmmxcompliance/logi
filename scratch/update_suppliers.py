import os

content = """import React, { useState, useEffect, useRef, useMemo } from 'react';
import { storageService } from '../services/storageService.ts';
import { Supplier, Dealer, UserRole, Quotation } from '../types.ts';
import { useAuth } from '../context/useAuth';
import { Plus, Search, Edit2, Trash2, X, Save, Truck, Anchor, Briefcase, Globe, Shield, ShieldCheck, ShieldAlert, DollarSign, Database, RotateCcw, FileDown, FileSpreadsheet, Upload } from 'lucide-react';
import { cffService } from '../services/cffService.ts';

const emptySupplier: Supplier = {
    id: '',
    name: '',
    type: 'Forwarder',
    contactName: '',
    email: '',
    phone: '',
    country: '',
    rfc: '',
    validationStatus: 'unchecked',
    status: 'Active',
    quotations: []
};

const emptyDealer: Dealer = {
    id: '',
    idDealer: '',
    shipTo: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    phone: '',
    country: ''
};

// CSV parsing helper for simple comma separated without quotes
const parseSimpleCSV = (text: string) => {
    const lines = text.split('\\n').filter(l => l.trim().length > 0);
    if (lines.length === 0) return [];
    
    // Naive split (fails if commas are inside quotes, but fine for simple exact header test)
    // A better approach is regex for quotes, but we'll use a standard one:
    const parseLine = (line: string) => {
        const result = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"' && line[i+1] === '"') {
                cur += '"';
                i++;
            } else if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(cur);
                cur = '';
            } else {
                cur += char;
            }
        }
        result.push(cur);
        return result.map(s => s.trim());
    };

    const headers = parseLine(lines[0]);
    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const row = parseLine(lines[i]);
        if (row.length === headers.length || row.some(x => x)) {
            const obj: any = {};
            headers.forEach((h, idx) => {
                obj[h] = row[idx] || '';
            });
            data.push(obj);
        }
    }
    return data;
};

const DEALER_KEYS: (keyof Dealer)[] = ['idDealer', 'shipTo', 'address', 'city', 'state', 'zip', 'phone', 'country'];

export const Suppliers = () => {
    const { hasRole } = useAuth();
    const canEdit = hasRole([UserRole.ADMIN, UserRole.EDITOR, UserRole.OPERATOR]);

    const [activeTab, setActiveTab] = useState<'suppliers' | 'dealers'>('suppliers');

    // -- SUPPLIERS STATE --
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [filter, setFilter] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentSupplier, setCurrentSupplier] = useState<Supplier>(emptySupplier);
    const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
    const [activeQuoteSupplier, setActiveQuoteSupplier] = useState<Supplier | null>(null);
    const [newQuote, setNewQuote] = useState<Quotation>({ id: '', concept: '', price: 0, currency: 'USD', lastUpdated: '' });

    // -- DEALERS STATE --
    const [dealers, setDealers] = useState<Dealer[]>([]);
    const [dealerFilter, setDealerFilter] = useState('');
    const [isDealerModalOpen, setIsDealerModalOpen] = useState(false);
    const [currentDealer, setCurrentDealer] = useState<Dealer>(emptyDealer);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Advanced Query Builder State for Dealers
    const [isMassQueryOpen, setIsMassQueryOpen] = useState(false);
    const [massQueryConditions, setMassQueryConditions] = useState<{ id: string, column: keyof Dealer, operator: string, value: any, type: string, input: string }[]>([]);
    const [activeMassQuery, setActiveMassQuery] = useState<{ id: string, column: keyof Dealer, operator: string, value: any, type: string, input: string }[] | null>(null);

    useEffect(() => {
        setSuppliers(storageService.getSuppliers());
        setDealers(storageService.getDealers());
        const unsub = storageService.subscribe(() => {
            setSuppliers(storageService.getSuppliers());
            setDealers(storageService.getDealers());
        });
        return unsub;
    }, []);

    // --- SUPPLIERS LOGIC ---
    const filteredSuppliers = suppliers.filter(s => {
        if (!filter) return true;
        const searchTerms = filter.toLowerCase().split(',').map(t => t.trim()).filter(t => t);
        return searchTerms.some(term =>
            Object.values(s).some(val =>
                val && typeof val !== 'object' && String(val).toLowerCase().includes(term)
            )
        );
    });

    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 50;
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentItems = filteredSuppliers.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(filteredSuppliers.length / itemsPerPage);

    useEffect(() => { setCurrentPage(1); }, [filter]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const validation = cffService.validatePartner(currentSupplier);
        const updatedSupplier = {
            ...currentSupplier,
            validationStatus: validation.status
        };

        if (validation.status === 'blacklisted') {
            if (!window.confirm(`WARNING: This partner is blacklisted by SAT (Art 69-B).\\nStatus: ${validation.message}\\n\\nDo you still want to save?`)) return;
        } else if (validation.status === 'warning') {
            alert(`Attention: ${validation.message}`);
        }

        await storageService.updateSupplier(updatedSupplier);
        setIsModalOpen(false);
    };

    const handleDelete = async (id: string) => {
        if (window.confirm("Are you sure you want to delete this partner?")) {
            await storageService.deleteSupplier(id);
        }
    };

    const openEdit = (s: Supplier) => { setCurrentSupplier(s); setIsModalOpen(true); };
    const openCreate = () => { setCurrentSupplier(emptySupplier); setIsModalOpen(true); };
    const openQuotes = (s: Supplier) => { setActiveQuoteSupplier(s); setNewQuote({ id: '', concept: '', price: 0, currency: 'USD', lastUpdated: '' }); setIsQuoteModalOpen(true); };
    const handleEditQuote = (q: Quotation) => { setNewQuote(q); };
    const cancelEdit = () => { setNewQuote({ id: '', concept: '', price: 0, currency: 'USD', lastUpdated: '' }); };

    const handleAddQuote = async () => {
        if (!activeQuoteSupplier || !newQuote.concept || newQuote.price <= 0) return;
        let updatedSupplier: Supplier;
        if (newQuote.id) {
            const updatedQuotations = activeQuoteSupplier.quotations?.map(q => q.id === newQuote.id ? { ...newQuote, lastUpdated: new Date().toISOString().split('T')[0] } : q) || [];
            updatedSupplier = { ...activeQuoteSupplier, quotations: updatedQuotations };
        } else {
            const quote: Quotation = { ...newQuote, id: Date.now().toString(36) + Math.random().toString(36).substring(2), lastUpdated: new Date().toISOString().split('T')[0] };
            updatedSupplier = { ...activeQuoteSupplier, quotations: [...(activeQuoteSupplier.quotations || []), quote] };
        }
        await storageService.updateSupplier(updatedSupplier);
        setActiveQuoteSupplier(updatedSupplier);
        setNewQuote({ id: '', concept: '', price: 0, currency: 'USD', lastUpdated: '' });
    };

    const handleDeleteQuote = async (quoteId: string) => {
        if (!activeQuoteSupplier) return;
        const updatedSupplier = { ...activeQuoteSupplier, quotations: activeQuoteSupplier.quotations?.filter(q => q.id !== quoteId) || [] };
        await storageService.updateSupplier(updatedSupplier);
        setActiveQuoteSupplier(updatedSupplier);
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'Forwarder': return <Anchor size={16} className="text-blue-500" />;
            case 'Carrier': return <Truck size={16} className="text-amber-500" />;
            case 'Broker': return <Briefcase size={16} className="text-emerald-500" />;
            default: return <Globe size={16} className="text-slate-500" />;
        }
    };

    const getValidationIcon = (status?: string) => {
        switch (status) {
            case 'compliant': return <ShieldCheck size={16} className="text-green-500" />;
            case 'blacklisted': return <ShieldAlert size={16} className="text-red-600 animate-pulse" />;
            case 'warning': return <ShieldAlert size={16} className="text-amber-500" />;
            default: return null;
        }
    };

    // --- DEALERS LOGIC ---

    // Mass Query Logic
    const addCondition = () => {
        setMassQueryConditions([...massQueryConditions, {
            id: Date.now().toString(),
            column: 'idDealer',
            operator: 'in',
            value: null,
            type: 'string',
            input: ''
        }]);
    };

    const updateCondition = (id: string, updates: Partial<any>) => {
        setMassQueryConditions(massQueryConditions.map(c => c.id === id ? { ...c, ...updates } : c));
    };

    const removeCondition = (id: string) => {
        setMassQueryConditions(massQueryConditions.filter(c => c.id !== id));
    };

    const handleApplyMassQuery = () => {
        const processedConditions = massQueryConditions.map(c => {
            let processedValue: any = c.input;
            if (c.operator === 'in') {
                processedValue = c.input.split(/[\\n,]+/).map(v => v.trim()).filter(v => v);
            } else if (c.type === 'number') {
                processedValue = Number(c.input);
            }
            return { ...c, value: processedValue };
        });
        setActiveMassQuery(processedConditions);
        setIsMassQueryOpen(false);
        setDealerPage(1);
    };

    const handleClearMassQuery = () => {
        setMassQueryConditions([]);
        setActiveMassQuery(null);
    };

    const applyMassQueryFilter = (record: Dealer, queryConditions: any[]) => {
        if (!queryConditions || queryConditions.length === 0) return true;

        return queryConditions.every(cond => {
            let recordValue = record[cond.column as keyof Dealer];
            if (recordValue === undefined || recordValue === null) recordValue = '';

            const isString = typeof recordValue === 'string';
            const strVal = String(recordValue).toLowerCase();
            const inputValStr = String(cond.input).toLowerCase();

            switch (cond.operator) {
                case 'in':
                    if (!cond.value || cond.value.length === 0) return true;
                    return cond.value.some((v: string) => strVal === v.toLowerCase() || String(recordValue) === String(v));
                case '==': return strVal === inputValStr;
                case '!=': return strVal !== inputValStr;
                case 'contains': return isString && strVal.includes(inputValStr);
                case 'not_contains': return isString && !strVal.includes(inputValStr);
                case 'empty': return strVal === '';
                case 'not_empty': return strVal !== '';
                case '>': return Number(recordValue) > Number(cond.value);
                case '>=': return Number(recordValue) >= Number(cond.value);
                case '<': return Number(recordValue) < Number(cond.value);
                case '<=': return Number(recordValue) <= Number(cond.value);
                default: return true;
            }
        });
    };

    const filteredDealers = useMemo(() => {
        return dealers.filter(d => {
            // Standard search bar filter
            if (dealerFilter) {
                const searchTerms = dealerFilter.toLowerCase().split(',').map(t => t.trim()).filter(t => t);
                const matchesText = searchTerms.some(term =>
                    Object.values(d).some(val =>
                        val && typeof val !== 'object' && String(val).toLowerCase().includes(term)
                    )
                );
                if (!matchesText) return false;
            }

            // Advanced Mass Query
            if (activeMassQuery) {
                if (!applyMassQueryFilter(d, activeMassQuery)) return false;
            }

            return true;
        });
    }, [dealers, dealerFilter, activeMassQuery]);

    const [dealerPage, setDealerPage] = useState(1);
    const dealersPerPage = 50;
    const dealerTotalPages = Math.ceil(filteredDealers.length / dealersPerPage);
    const currentDealers = useMemo(() => {
        const start = (dealerPage - 1) * dealersPerPage;
        return filteredDealers.slice(start, start + dealersPerPage);
    }, [filteredDealers, dealerPage]);

    useEffect(() => { setDealerPage(1); }, [dealerFilter]);

    const handleSaveDealer = async (e: React.FormEvent) => {
        e.preventDefault();
        await storageService.updateDealer(currentDealer);
        setIsDealerModalOpen(false);
    };

    const handleDeleteDealer = async (id: string) => {
        if (window.confirm("Are you sure you want to delete this dealer?")) {
            await storageService.deleteDealer(id);
        }
    };

    const handleDealerCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const text = event.target?.result as string;
            const parsed = parseSimpleCSV(text);
            
            // Map parsed CSV back to Dealer keys matching exactly
            const mappedDealers = parsed.map((row: any) => ({
                idDealer: row['IdDealer'] || row['idDealer'] || '',
                shipTo: row['Ship To'] || row['shipTo'] || '',
                address: row['Address'] || row['address'] || '',
                city: row['City'] || row['city'] || '',
                state: row['State'] || row['state'] || '',
                zip: row['ZIP'] || row['zip'] || '',
                phone: row['Phone'] || row['phone'] || '',
                country: row['Country'] || row['country'] || ''
            }));

            if (mappedDealers.length > 0) {
                if (window.confirm(`Ready to import ${mappedDealers.length} dealers. Proceed?`)) {
                    await storageService.massImportDealers(mappedDealers);
                    alert("Import completed successfully.");
                }
            } else {
                alert("No valid rows found or headers do not match (IdDealer, Ship To, Address, City, State, ZIP, Phone, Country).");
            }
        };
        reader.readAsText(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleDownloadTemplate = () => {
        const headers = ['IdDealer', 'Ship To', 'Address', 'City', 'State', 'ZIP', 'Phone', 'Country'];
        
        const rows = filteredDealers.map(d => [
            d.idDealer, d.shipTo, d.address, d.city, d.state, d.zip, d.phone, d.country
        ].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(','));

        const csvContent = [headers.join(','), ...rows].join('\\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'Dealers_Export.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-slate-800">Partners & Suppliers</h1>
                
                {canEdit && activeTab === 'suppliers' && (
                    <button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-all">
                        <Plus size={18} /> Add Partner
                    </button>
                )}
                {canEdit && activeTab === 'dealers' && (
                    <div className="flex gap-2">
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleDealerCSVUpload}
                            accept=".csv"
                            className="hidden"
                        />
                        <button onClick={() => fileInputRef.current?.click()} className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-all">
                            <Upload size={18} /> Bulk Upload (CSV)
                        </button>
                        <button onClick={handleDownloadTemplate} className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-all">
                            <FileDown size={18} /> Export (CSV)
                        </button>
                        <button onClick={() => { setCurrentDealer(emptyDealer); setIsDealerModalOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-all">
                            <Plus size={18} /> Add Dealer
                        </button>
                    </div>
                )}
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200">
                <button
                    onClick={() => setActiveTab('suppliers')}
                    className={`px-6 py-3 font-medium text-sm transition-colors relative ${activeTab === 'suppliers' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                >
                    Suppliers
                    {activeTab === 'suppliers' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></div>}
                </button>
                <button
                    onClick={() => setActiveTab('dealers')}
                    className={`px-6 py-3 font-medium text-sm transition-colors relative ${activeTab === 'dealers' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                >
                    Dealers
                    {activeTab === 'dealers' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></div>}
                </button>
            </div>

            {activeTab === 'suppliers' && (
                <>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                        <div className="relative">
                            <Search className="absolute left-3 top-3 text-slate-400" size={18} />
                            <input
                                type="text"
                                placeholder="Search partners by name, contact or email..."
                                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={filter}
                                onChange={(e) => setFilter(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4">Company</th>
                                    <th className="px-6 py-4">Type</th>
                                    <th className="px-6 py-4">Contact</th>
                                    <th className="px-6 py-4">Email</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {currentItems.map(s => (
                                    <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-slate-800 flex items-center gap-2">
                                                {s.name}
                                                {getValidationIcon(s.validationStatus)}
                                            </div>
                                            {s.rfc && <div className="text-xs text-slate-400 font-mono">{s.rfc}</div>}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                {getTypeIcon(s.type)}
                                                <span>{s.type}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-slate-600">{s.contactName}</td>
                                        <td className="px-6 py-4 text-blue-600 hover:underline cursor-pointer">{s.email}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${s.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                {s.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex justify-center gap-2">
                                                <button onClick={() => openQuotes(s)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Manage Quotes">
                                                    <DollarSign size={18} />
                                                </button>
                                                {canEdit && (
                                                    <>
                                                        <button onClick={() => openEdit(s)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Edit">
                                                            <Edit2 size={18} />
                                                        </button>
                                                        <button onClick={() => handleDelete(s.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg" title="Delete">
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {filteredSuppliers.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400">No partners found.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                        {totalPages > 1 && (
                            <div className="flex justify-between items-center p-4 border-t border-slate-100 bg-slate-50/50">
                                <div className="text-sm text-slate-500">
                                    Showing {indexOfFirstItem + 1}-{Math.min(indexOfLastItem, filteredSuppliers.length)} of {filteredSuppliers.length}
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="px-3 py-1 bg-white border border-slate-200 rounded text-sm disabled:opacity-50 hover:bg-slate-50">Previous</button>
                                    <span className="px-3 py-1 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded">Page {currentPage}</span>
                                    <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="px-3 py-1 bg-white border border-slate-200 rounded text-sm disabled:opacity-50 hover:bg-slate-50">Next</button>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}

            {activeTab === 'dealers' && (
                <>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-3 text-slate-400" size={18} />
                            <input
                                type="text"
                                placeholder="Search dealers by any field (comma separated)..."
                                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                value={dealerFilter}
                                onChange={(e) => setDealerFilter(e.target.value)}
                            />
                        </div>
                        <button
                            onClick={() => setIsMassQueryOpen(true)}
                            className={`flex items-center gap-2 px-4 py-2 border rounded-lg shadow-sm transition-colors ${activeMassQuery && activeMassQuery.length > 0
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold'
                                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                                }`}
                        >
                            <Database size={16} /> {activeMassQuery && activeMassQuery.length > 0 ? `Query Active (${activeMassQuery.length})` : 'Mass Query'}
                        </button>
                        {activeMassQuery && activeMassQuery.length > 0 && (
                            <button onClick={handleClearMassQuery} className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 text-red-600 rounded-lg hover:bg-red-100 shadow-sm transition-colors"><X size={16} /></button>
                        )}
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <table className="w-full text-sm text-left whitespace-nowrap">
                            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4">IdDealer</th>
                                    <th className="px-6 py-4">Ship To</th>
                                    <th className="px-6 py-4">Address</th>
                                    <th className="px-6 py-4">City</th>
                                    <th className="px-6 py-4">State</th>
                                    <th className="px-6 py-4">ZIP</th>
                                    <th className="px-6 py-4">Country</th>
                                    <th className="px-6 py-4">Phone</th>
                                    <th className="px-6 py-4 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {currentDealers.map(d => (
                                    <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4 font-bold text-slate-800">{d.idDealer}</td>
                                        <td className="px-6 py-4 text-slate-700">{d.shipTo}</td>
                                        <td className="px-6 py-4 text-slate-500">{d.address}</td>
                                        <td className="px-6 py-4 text-slate-500">{d.city}</td>
                                        <td className="px-6 py-4 text-slate-500">{d.state}</td>
                                        <td className="px-6 py-4 text-slate-500">{d.zip}</td>
                                        <td className="px-6 py-4 text-slate-500">{d.country}</td>
                                        <td className="px-6 py-4 text-slate-500">{d.phone}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex justify-center gap-2">
                                                {canEdit && (
                                                    <>
                                                        <button onClick={() => { setCurrentDealer(d); setIsDealerModalOpen(true); }} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg"><Edit2 size={18} /></button>
                                                        <button onClick={() => handleDeleteDealer(d.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={18} /></button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {filteredDealers.length === 0 && (
                                    <tr>
                                        <td colSpan={9} className="px-6 py-12 text-center text-slate-400">No dealers found.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                        {dealerTotalPages > 1 && (
                            <div className="flex justify-between items-center p-4 border-t border-slate-100 bg-slate-50/50">
                                <div className="text-sm text-slate-500">
                                    Showing {(dealerPage - 1) * dealersPerPage + 1}-{Math.min(dealerPage * dealersPerPage, filteredDealers.length)} of {filteredDealers.length}
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => setDealerPage(prev => Math.max(prev - 1, 1))} disabled={dealerPage === 1} className="px-3 py-1 bg-white border border-slate-200 rounded text-sm disabled:opacity-50 hover:bg-slate-50">Previous</button>
                                    <span className="px-3 py-1 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded">Page {dealerPage}</span>
                                    <button onClick={() => setDealerPage(prev => Math.min(prev + 1, dealerTotalPages))} disabled={dealerPage === dealerTotalPages} className="px-3 py-1 bg-white border border-slate-200 rounded text-sm disabled:opacity-50 hover:bg-slate-50">Next</button>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* SUPPLIERS MODALS (Add/Edit and Quotes) are here but hidden to save space. We include them back verbatim */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center p-6 border-b border-slate-100">
                            <h2 className="text-xl font-bold text-slate-800">
                                {currentSupplier.id ? 'Edit Partner' : 'Add New Partner'}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleSave} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Company Name</label>
                                <input required className="w-full border border-slate-300 rounded-lg px-3 py-2" value={currentSupplier.name} onChange={e => setCurrentSupplier({ ...currentSupplier, name: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                                    <select className="w-full border border-slate-300 rounded-lg px-3 py-2" value={currentSupplier.type} onChange={e => setCurrentSupplier({ ...currentSupplier, type: e.target.value as any })}>
                                        <option value="Forwarder">Forwarder</option>
                                        <option value="Carrier">Carrier</option>
                                        <option value="Broker">Broker</option>
                                        <option value="Material Vendor">Material Vendor</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                                    <select className="w-full border border-slate-300 rounded-lg px-3 py-2" value={currentSupplier.status} onChange={e => setCurrentSupplier({ ...currentSupplier, status: e.target.value as any })}>
                                        <option value="Active">Active</option>
                                        <option value="Inactive">Inactive</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Contact Person</label>
                                <input className="w-full border border-slate-300 rounded-lg px-3 py-2" value={currentSupplier.contactName} onChange={e => setCurrentSupplier({ ...currentSupplier, contactName: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                                    <input type="email" className="w-full border border-slate-300 rounded-lg px-3 py-2" value={currentSupplier.email} onChange={e => setCurrentSupplier({ ...currentSupplier, email: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                                    <input className="w-full border border-slate-300 rounded-lg px-3 py-2" value={currentSupplier.phone} onChange={e => setCurrentSupplier({ ...currentSupplier, phone: e.target.value })} />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Country / Region</label>
                                <input className="w-full border border-slate-300 rounded-lg px-3 py-2" value={currentSupplier.country} onChange={e => setCurrentSupplier({ ...currentSupplier, country: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">RFC (Mexico Only)</label>
                                <div className="flex gap-2">
                                    <input className="w-full border border-slate-300 rounded-lg px-3 py-2 font-mono uppercase" placeholder="XAXX010101000" value={currentSupplier.rfc || ''} onChange={e => setCurrentSupplier({ ...currentSupplier, rfc: e.target.value.toUpperCase() })} />
                                    {currentSupplier.rfc && getValidationIcon(cffService.validatePartner(currentSupplier).status)}
                                </div>
                            </div>
                            <div className="pt-4 flex justify-end gap-3">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg">Cancel</button>
                                <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"><Save size={18} /> Save</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isQuoteModalOpen && activeQuoteSupplier && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50">
                            <div>
                                <h2 className="text-xl font-bold text-slate-800">Quotations</h2>
                                <p className="text-sm text-slate-500">Manage agreed rates for {activeQuoteSupplier.name}</p>
                            </div>
                            <button onClick={() => setIsQuoteModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1">
                            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6">
                                <h3 className="text-sm font-bold text-slate-700 mb-3 uppercase">{newQuote.id ? 'Edit Rate' : 'Add New Rate'}</h3>
                                <div className="flex gap-3 items-end">
                                    <div className="flex-1">
                                        <label className="block text-xs font-medium text-slate-500 mb-1">Concept (Must match Invoice)</label>
                                        <input type="text" placeholder="e.g. Flete Aereo" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={newQuote.concept} onChange={e => setNewQuote({ ...newQuote, concept: e.target.value })} />
                                    </div>
                                    <div className="w-32">
                                        <label className="block text-xs font-medium text-slate-500 mb-1">Price (Total)</label>
                                        <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={newQuote.price || ''} onChange={e => setNewQuote({ ...newQuote, price: parseFloat(e.target.value) || 0 })} />
                                    </div>
                                    <div className="w-24">
                                        <label className="block text-xs font-medium text-slate-500 mb-1">Cont. Count</label>
                                        <input type="number" placeholder="Any" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={newQuote.validForContainerCount || ''} onChange={e => setNewQuote({ ...newQuote, validForContainerCount: parseInt(e.target.value) || undefined })} title="Validation Rule: Only apply this price if the invoice lists exactly this many containers." />
                                    </div>
                                    <div className="w-24">
                                        <label className="block text-xs font-medium text-slate-500 mb-1">Currency</label>
                                        <select className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={newQuote.currency} onChange={e => setNewQuote({ ...newQuote, currency: e.target.value as any })}>
                                            <option value="USD">USD</option>
                                            <option value="MXN">MXN</option>
                                        </select>
                                    </div>
                                    <div className="flex gap-1">
                                        {newQuote.id && (
                                            <button onClick={cancelEdit} className="bg-slate-200 text-slate-600 p-2 rounded hover:bg-slate-300 transition-colors" title="Cancel Edit"><X size={20} /></button>
                                        )}
                                        <button onClick={handleAddQuote} disabled={!newQuote.concept || newQuote.price <= 0} className={`${newQuote.id ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'} text-white p-2 rounded disabled:opacity-50 transition-colors`} title={newQuote.id ? "Update Rate" : "Add Rate"}>
                                            {newQuote.id ? <Save size={20} /> : <Plus size={20} />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <table className="w-full text-sm text-left">
                                <thead className="bg-white text-slate-500 border-b border-slate-200">
                                    <tr><th className="py-2">Concept</th><th className="py-2 text-right">Price</th><th className="py-2 text-center">Currency</th><th className="py-2 text-right">Last Updated</th><th className="py-2 text-center">Action</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {activeQuoteSupplier.quotations?.map(q => (
                                        <tr key={q.id} className={newQuote.id === q.id ? 'bg-blue-50' : ''}>
                                            <td className="py-3 font-medium text-slate-700">{q.concept}{q.validForContainerCount && (<span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700">{q.validForContainerCount} Cont.</span>)}</td>
                                            <td className="py-3 text-right font-mono">{q.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                            <td className="py-3 text-center text-xs text-slate-400">{q.currency}</td>
                                            <td className="py-3 text-right text-slate-500 text-xs">{q.lastUpdated}</td>
                                            <td className="py-3 text-center">
                                                <div className="flex justify-center gap-2">
                                                    <button onClick={() => handleEditQuote(q)} className="text-blue-400 hover:text-blue-600" title="Edit"><Edit2 size={16} /></button>
                                                    <button onClick={() => handleDeleteQuote(q.id)} className="text-red-400 hover:text-red-600" title="Delete"><Trash2 size={16} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {(!activeQuoteSupplier.quotations || activeQuoteSupplier.quotations.length === 0) && (
                                        <tr><td colSpan={5} className="py-8 text-center text-slate-400">No active quotations found.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="p-4 bg-slate-50 border-t border-slate-200 text-right">
                            <button onClick={() => setIsQuoteModalOpen(false)} className="px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300">Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* DEALERS MODAL */}
            {isDealerModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center p-6 border-b border-slate-100">
                            <h2 className="text-xl font-bold text-slate-800">
                                {currentDealer.id ? 'Edit Dealer' : 'Add New Dealer'}
                            </h2>
                            <button onClick={() => setIsDealerModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveDealer} className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">IdDealer *</label>
                                    <input required className="w-full border border-slate-300 rounded-lg px-3 py-2" value={currentDealer.idDealer} onChange={e => setCurrentDealer({ ...currentDealer, idDealer: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Ship To (Name) *</label>
                                    <input required className="w-full border border-slate-300 rounded-lg px-3 py-2" value={currentDealer.shipTo} onChange={e => setCurrentDealer({ ...currentDealer, shipTo: e.target.value })} />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                                <input className="w-full border border-slate-300 rounded-lg px-3 py-2" value={currentDealer.address} onChange={e => setCurrentDealer({ ...currentDealer, address: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                                    <input className="w-full border border-slate-300 rounded-lg px-3 py-2" value={currentDealer.city} onChange={e => setCurrentDealer({ ...currentDealer, city: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
                                    <input className="w-full border border-slate-300 rounded-lg px-3 py-2" value={currentDealer.state} onChange={e => setCurrentDealer({ ...currentDealer, state: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">ZIP</label>
                                    <input className="w-full border border-slate-300 rounded-lg px-3 py-2" value={currentDealer.zip || ''} onChange={e => setCurrentDealer({ ...currentDealer, zip: e.target.value })} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Country</label>
                                    <input className="w-full border border-slate-300 rounded-lg px-3 py-2" value={currentDealer.country} onChange={e => setCurrentDealer({ ...currentDealer, country: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                                    <input className="w-full border border-slate-300 rounded-lg px-3 py-2" value={currentDealer.phone || ''} onChange={e => setCurrentDealer({ ...currentDealer, phone: e.target.value })} />
                                </div>
                            </div>
                            <div className="pt-4 flex justify-end gap-3">
                                <button type="button" onClick={() => setIsDealerModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg">Cancel</button>
                                <button type="submit" className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"><Save size={18} /> Save</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MASS QUERY MODAL */}
            {isMassQueryOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                        <div className="bg-slate-50 p-6 border-b border-slate-100 flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                    <Database size={20} className="text-indigo-600" />
                                    Advanced Query Builder (Dealers)
                                </h3>
                                <p className="text-xs text-slate-500 mt-1">Combine multiple filters to find specific dealers.</p>
                            </div>
                            <button onClick={() => setIsMassQueryOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                        </div>

                        <div className="p-6 flex-1 overflow-y-auto space-y-6">
                            {massQueryConditions.map((cond, index) => (
                                <div key={cond.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 relative group animate-in slide-in-from-top-2 duration-200">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">{index + 1}</div>
                                        <div className="h-px flex-1 bg-slate-200"></div>
                                        {massQueryConditions.length > 1 && (
                                            <button onClick={() => removeCondition(cond.id)} className="text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Column</label>
                                            <select className="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white" value={cond.column} onChange={(e) => updateCondition(cond.id, { column: e.target.value as keyof Dealer })}>
                                                {DEALER_KEYS.map(key => <option key={key} value={key}>{key}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Operator</label>
                                            <select className="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white" value={cond.operator} onChange={(e) => updateCondition(cond.id, { operator: e.target.value })}>
                                                <option value="in">(in) in list</option>
                                                <option value="==">(==) equal to</option>
                                                <option value="!=">(!=) not equal to</option>
                                                <option value="contains">contains</option>
                                                <option value="not_contains">not contains</option>
                                                <option value="empty">is empty</option>
                                                <option value="not_empty">is NOT empty</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Data Type</label>
                                            <select className="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white" value={cond.type} disabled={cond.operator === 'empty' || cond.operator === 'not_empty'} onChange={(e) => updateCondition(cond.id, { type: e.target.value as any })}>
                                                <option value="string">String (Text)</option>
                                                <option value="number">Number</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Value</label>
                                        <textarea
                                            className="w-full border border-slate-300 rounded-lg p-3 font-mono text-sm min-h-[80px]"
                                            value={cond.operator === 'empty' || cond.operator === 'not_empty' ? '' : cond.input}
                                            disabled={cond.operator === 'empty' || cond.operator === 'not_empty'}
                                            onChange={(e) => updateCondition(cond.id, { input: e.target.value })}
                                        />
                                    </div>
                                </div>
                            ))}
                            <button onClick={addCondition} className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 flex justify-center gap-2 font-medium">
                                <Plus size={18} /> Add Another Condition
                            </button>
                        </div>
                        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                            <button onClick={handleClearMassQuery} className="text-red-600 hover:text-red-700 font-medium text-sm flex gap-1"><RotateCcw size={16} /> Reset All</button>
                            <div className="flex gap-3">
                                <button onClick={() => setIsMassQueryOpen(false)} className="px-4 py-2 border border-slate-200 rounded-lg">Cancel</button>
                                <button onClick={handleApplyMassQuery} className="px-6 py-2 bg-indigo-600 text-white rounded-lg flex gap-2"><Search size={16} /> Apply Filter</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
"""

with open('pages/Suppliers.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated Suppliers.tsx successfully")
