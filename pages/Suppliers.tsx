import React, { useState, useEffect } from 'react';
import { storageService } from '../services/storageService.ts';
import { Supplier, UserRole } from '../types.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { Plus, Search, Edit2, Trash2, X, Save, Truck, Anchor, Briefcase, Globe } from 'lucide-react';

const emptySupplier: Supplier = {
    id: '',
    name: '',
    type: 'Forwarder',
    contactName: '',
    email: '',
    phone: '',
    country: '',
    status: 'Active'
};

export const Suppliers = () => {
    const { hasRole } = useAuth();
    const canEdit = hasRole([UserRole.ADMIN, UserRole.EDITOR]);
    
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [filter, setFilter] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentSupplier, setCurrentSupplier] = useState<Supplier>(emptySupplier);

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
        await storageService.updateSupplier(currentSupplier);
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

    const getTypeIcon = (type: string) => {
        switch(type) {
            case 'Forwarder': return <Anchor size={16} className="text-blue-500"/>;
            case 'Carrier': return <Truck size={16} className="text-amber-500"/>;
            case 'Broker': return <Briefcase size={16} className="text-emerald-500"/>;
            default: return <Globe size={16} className="text-slate-500"/>;
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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredSuppliers.map(s => (
                    <div key={s.id} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow relative group">
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center border border-slate-100">
                                    {getTypeIcon(s.type)}
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-800">{s.name}</h3>
                                    <span className="text-xs font-medium px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">{s.type}</span>
                                </div>
                            </div>
                            <span className={`w-2 h-2 rounded-full ${s.status === 'Active' ? 'bg-green-500' : 'bg-red-300'}`}></span>
                        </div>
                        
                        <div className="space-y-2 text-sm text-slate-600">
                            <div className="flex items-center gap-2">
                                <span className="text-slate-400 w-20">Contact:</span>
                                <span className="font-medium">{s.contactName}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-slate-400 w-20">Email:</span>
                                <a href={`mailto:${s.email}`} className="text-blue-600 hover:underline truncate">{s.email}</a>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-slate-400 w-20">Phone:</span>
                                <span>{s.phone}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-slate-400 w-20">Country:</span>
                                <span>{s.country}</span>
                            </div>
                        </div>

                        {canEdit && (
                            <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => openEdit(s)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded">
                                    <Edit2 size={16} />
                                </button>
                                <button onClick={() => handleDelete(s.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>

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
                                <input required className="w-full border border-slate-300 rounded-lg px-3 py-2" value={currentSupplier.name} onChange={e => setCurrentSupplier({...currentSupplier, name: e.target.value})} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                                    <select className="w-full border border-slate-300 rounded-lg px-3 py-2" value={currentSupplier.type} onChange={e => setCurrentSupplier({...currentSupplier, type: e.target.value as any})}>
                                        <option value="Forwarder">Forwarder</option>
                                        <option value="Carrier">Carrier</option>
                                        <option value="Broker">Broker</option>
                                        <option value="Material Vendor">Material Vendor</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                                    <select className="w-full border border-slate-300 rounded-lg px-3 py-2" value={currentSupplier.status} onChange={e => setCurrentSupplier({...currentSupplier, status: e.target.value as any})}>
                                        <option value="Active">Active</option>
                                        <option value="Inactive">Inactive</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Contact Person</label>
                                <input className="w-full border border-slate-300 rounded-lg px-3 py-2" value={currentSupplier.contactName} onChange={e => setCurrentSupplier({...currentSupplier, contactName: e.target.value})} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                                    <input type="email" className="w-full border border-slate-300 rounded-lg px-3 py-2" value={currentSupplier.email} onChange={e => setCurrentSupplier({...currentSupplier, email: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                                    <input className="w-full border border-slate-300 rounded-lg px-3 py-2" value={currentSupplier.phone} onChange={e => setCurrentSupplier({...currentSupplier, phone: e.target.value})} />
                                </div>
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Country / Region</label>
                                <input className="w-full border border-slate-300 rounded-lg px-3 py-2" value={currentSupplier.country} onChange={e => setCurrentSupplier({...currentSupplier, country: e.target.value})} />
                            </div>
                            <div className="pt-4 flex justify-end gap-3">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg">Cancel</button>
                                <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                                    <Save size={18} /> Save
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};