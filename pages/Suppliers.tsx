import React, { useState, useEffect } from 'react';
import { storageService } from '../services/storageService.ts';
import { Supplier, UserRole, Quotation } from '../types.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { Plus, Search, Edit2, Trash2, X, Save, Truck, Anchor, Briefcase, Globe, Shield, ShieldCheck, ShieldAlert, DollarSign } from 'lucide-react';
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

export const Suppliers = () => {
    const { hasRole } = useAuth();
    const canEdit = hasRole([UserRole.ADMIN, UserRole.EDITOR, UserRole.OPERATOR]);

    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [filter, setFilter] = useState('');

    // Partner Modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentSupplier, setCurrentSupplier] = useState<Supplier>(emptySupplier);

    // Quotations Modal
    const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
    const [activeQuoteSupplier, setActiveQuoteSupplier] = useState<Supplier | null>(null);
    const [newQuote, setNewQuote] = useState<Quotation>({ id: '', concept: '', price: 0, currency: 'USD', lastUpdated: '' });

    useEffect(() => {
        setSuppliers(storageService.getSuppliers());
        const unsub = storageService.subscribe(() => {
            setSuppliers(storageService.getSuppliers());
        });
        return unsub;
    }, []);

    const filteredSuppliers = suppliers.filter(s =>
        s.name.toLowerCase().includes(filter.toLowerCase()) ||
        s.contactName.toLowerCase().includes(filter.toLowerCase()) ||
        s.email.toLowerCase().includes(filter.toLowerCase())
    );

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const validation = cffService.validatePartner(currentSupplier);
        const updatedSupplier = {
            ...currentSupplier,
            validationStatus: validation.status
        };

        if (validation.status === 'blacklisted') {
            if (!window.confirm(`WARNING: This partner is blacklisted by SAT (Art 69-B).\nStatus: ${validation.message}\n\nDo you still want to save?`)) return;
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

    const openEdit = (s: Supplier) => {
        setCurrentSupplier(s);
        setIsModalOpen(true);
    };

    const openCreate = () => {
        setCurrentSupplier(emptySupplier);
        setIsModalOpen(true);
    };

    const openQuotes = (s: Supplier) => {
        setActiveQuoteSupplier(s);
        setNewQuote({ id: '', concept: '', price: 0, currency: 'USD', lastUpdated: '' });
        setIsQuoteModalOpen(true);
    };

    const handleEditQuote = (q: Quotation) => {
        setNewQuote(q);
    };

    const cancelEdit = () => {
        setNewQuote({ id: '', concept: '', price: 0, currency: 'USD', lastUpdated: '' });
    };

    const handleAddQuote = async () => {
        if (!activeQuoteSupplier || !newQuote.concept || newQuote.price <= 0) return;

        let updatedSupplier: Supplier;

        if (newQuote.id) {
            // Update existing
            const updatedQuotations = activeQuoteSupplier.quotations?.map(q =>
                q.id === newQuote.id
                    ? { ...newQuote, lastUpdated: new Date().toISOString().split('T')[0] }
                    : q
            ) || [];
            updatedSupplier = { ...activeQuoteSupplier, quotations: updatedQuotations };
        } else {
            // Create new
            const quote: Quotation = {
                ...newQuote,
                id: crypto.randomUUID(),
                lastUpdated: new Date().toISOString().split('T')[0]
            };
            updatedSupplier = {
                ...activeQuoteSupplier,
                quotations: [...(activeQuoteSupplier.quotations || []), quote]
            };
        }

        await storageService.updateSupplier(updatedSupplier);
        setActiveQuoteSupplier(updatedSupplier);
        setNewQuote({ id: '', concept: '', price: 0, currency: 'USD', lastUpdated: '' });
    };

    const handleDeleteQuote = async (quoteId: string) => {
        if (!activeQuoteSupplier) return;
        const updatedSupplier = {
            ...activeQuoteSupplier,
            quotations: activeQuoteSupplier.quotations?.filter(q => q.id !== quoteId) || []
        };
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

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-slate-800">Partners & Suppliers</h1>
                {canEdit && (
                    <button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-all">
                        <Plus size={18} /> Add Partner
                    </button>
                )}
            </div>

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

            {/* Table View */}
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
                        {filteredSuppliers.map(s => (
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
            </div>

            {/* Partner Modal */}
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

            {/* Quotations Modal */}
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
                            {/* Add New Quote */}
                            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6">
                                <h3 className="text-sm font-bold text-slate-700 mb-3 uppercase">{newQuote.id ? 'Edit Rate' : 'Add New Rate'}</h3>
                                <div className="flex gap-3 items-end">
                                    <div className="flex-1">
                                        <label className="block text-xs font-medium text-slate-500 mb-1">Concept (Must match Invoice)</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Flete Aereo"
                                            className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                                            value={newQuote.concept}
                                            onChange={e => setNewQuote({ ...newQuote, concept: e.target.value })}
                                        />
                                    </div>
                                    <div className="w-32">
                                        <label className="block text-xs font-medium text-slate-500 mb-1">Price (Total)</label>
                                        <input
                                            type="number"
                                            className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                                            value={newQuote.price || ''}
                                            onChange={e => setNewQuote({ ...newQuote, price: parseFloat(e.target.value) || 0 })}
                                        />
                                    </div>
                                    <div className="w-24">
                                        <label className="block text-xs font-medium text-slate-500 mb-1">Currency</label>
                                        <select
                                            className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                                            value={newQuote.currency}
                                            onChange={e => setNewQuote({ ...newQuote, currency: e.target.value as any })}
                                        >
                                            <option value="USD">USD</option>
                                            <option value="MXN">MXN</option>
                                        </select>
                                    </div>
                                    <div className="flex gap-1">
                                        {newQuote.id && (
                                            <button
                                                onClick={cancelEdit}
                                                className="bg-slate-200 text-slate-600 p-2 rounded hover:bg-slate-300 transition-colors"
                                                title="Cancel Edit"
                                            >
                                                <X size={20} />
                                            </button>
                                        )}
                                        <button
                                            onClick={handleAddQuote}
                                            disabled={!newQuote.concept || newQuote.price <= 0}
                                            className={`${newQuote.id ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'} text-white p-2 rounded disabled:opacity-50 transition-colors`}
                                            title={newQuote.id ? "Update Rate" : "Add Rate"}
                                        >
                                            {newQuote.id ? <Save size={20} /> : <Plus size={20} />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* List Quotes */}
                            <table className="w-full text-sm text-left">
                                <thead className="bg-white text-slate-500 border-b border-slate-200">
                                    <tr>
                                        <th className="py-2">Concept</th>
                                        <th className="py-2 text-right">Price</th>
                                        <th className="py-2 text-center">Currency</th>
                                        <th className="py-2 text-right">Last Updated</th>
                                        <th className="py-2 text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {activeQuoteSupplier.quotations?.map(q => (
                                        <tr key={q.id} className={newQuote.id === q.id ? 'bg-blue-50' : ''}>
                                            <td className="py-3 font-medium text-slate-700">{q.concept}</td>
                                            <td className="py-3 text-right font-mono">{q.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                            <td className="py-3 text-center text-xs text-slate-400">{q.currency}</td>
                                            <td className="py-3 text-right text-slate-500 text-xs">{q.lastUpdated}</td>
                                            <td className="py-3 text-center">
                                                <div className="flex justify-center gap-2">
                                                    <button onClick={() => handleEditQuote(q)} className="text-blue-400 hover:text-blue-600" title="Edit">
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button onClick={() => handleDeleteQuote(q.id)} className="text-red-400 hover:text-red-600" title="Delete">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {(!activeQuoteSupplier.quotations || activeQuoteSupplier.quotations.length === 0) && (
                                        <tr>
                                            <td colSpan={5} className="py-8 text-center text-slate-400">No active quotations found.</td>
                                        </tr>
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
        </div>
    );
};