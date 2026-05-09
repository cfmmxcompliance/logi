import React, { useEffect, useState } from 'react';
import { storageService } from '../services/storageService.ts';
import { Database, Trash2, AlertTriangle, History, RotateCcw, Save, Users, Shield, Play, Key, UserPlus, Mail, Plus, Search } from 'lucide-react';
import { CatalogQueryBuilder, evaluateCondition, QueryCondition } from '../components/CatalogQueryBuilder.tsx';
import { RestorePoint, UserRole, User } from '../types.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { authService } from '../services/authService.ts';

export const Settings = () => {
    const { hasRole, user } = useAuth();
    const isAdmin = hasRole([UserRole.ADMIN]);

    const [snapshots, setSnapshots] = useState<RestorePoint[]>([]);
    const [systemUsers, setSystemUsers] = useState<User[]>([]);
    const [reportEmails, setReportEmails] = useState<string[]>([]);
    const [newEmail, setNewEmail] = useState('');

    const [userFilter, setUserFilter] = useState('');
    const [showUserQueryBuilder, setShowUserQueryBuilder] = useState(false);
    const [userQueryConditions, setUserQueryConditions] = useState<QueryCondition[]>([]);

    const [emailFilter, setEmailFilter] = useState('');
    const [showEmailQueryBuilder, setShowEmailQueryBuilder] = useState(false);
    const [emailQueryConditions, setEmailQueryConditions] = useState<QueryCondition[]>([]);

    const filteredUsers = React.useMemo(() => {
        return systemUsers.filter(u => {
            if (userFilter) {
                const terms = userFilter.toLowerCase().split(',').map(t => t.trim()).filter(t => t);
                const matchesText = terms.some(term => 
                    (u.username?.toLowerCase().includes(term)) ||
                    (u.name?.toLowerCase().includes(term)) ||
                    (u.role?.toLowerCase().includes(term)) ||
                    (u.scac?.toLowerCase().includes(term)) ||
                    (u.subLinea?.toLowerCase().includes(term)) ||
                    (u.email?.toLowerCase().includes(term))
                );
                if (!matchesText) return false;
            }
            if (userQueryConditions.length > 0) {
                const matchesQuery = userQueryConditions.every(cond => {
                    let val: any = '';
                    if (cond.column === 'username') val = u.username || u.email;
                    if (cond.column === 'name') val = u.name;
                    if (cond.column === 'role') val = u.role;
                    if (cond.column === 'scac') val = u.scac;
                    if (cond.column === 'subLinea') val = u.subLinea;
                    return evaluateCondition(val, cond);
                });
                if (!matchesQuery) return false;
            }
            return true;
        });
    }, [systemUsers, userFilter, userQueryConditions]);

    const filteredEmails = React.useMemo(() => {
        return reportEmails.filter(email => {
            if (emailFilter) {
                const terms = emailFilter.toLowerCase().split(',').map(t => t.trim()).filter(t => t);
                const matchesText = terms.some(term => email.toLowerCase().includes(term));
                if (!matchesText) return false;
            }
            if (emailQueryConditions.length > 0) {
                const matchesQuery = emailQueryConditions.every(cond => {
                    return evaluateCondition(email, cond);
                });
                if (!matchesQuery) return false;
            }
            return true;
        });
    }, [reportEmails, emailFilter, emailQueryConditions]);

    useEffect(() => {
        // Initial load
        const fetchSnapshots = async () => {
            const data = await storageService.getSnapshots();
            setSnapshots(data);
        };
        fetchSnapshots();

        // Only fetch users if Admin
        if (isAdmin) {
            // @ts-ignore
            authService.getUsers().then(users => setSystemUsers(users));
            // @ts-ignore
            storageService.getAuditReportEmails().then(emails => setReportEmails(emails));
        }

        // Subscribe to changes (e.g. if auto-backup runs)
        const unsub = storageService.subscribe(async () => {
            const data = await storageService.getSnapshots();
            setSnapshots(data);
        });
        return unsub;
    }, [isAdmin]);

    const handleReset = () => {
        if (!isAdmin) return;

        if (window.confirm("⚠️ DANGER ZONE\n\nAre you sure you want to delete ALL data and reset to the default mock data? This action cannot be undone.")) {
            // @ts-ignore
            if (storageService.resetDatabase) {
                // @ts-ignore
                storageService.resetDatabase();
            } else {
                localStorage.clear();
                window.location.reload();
            }
        }
    };

    const handleSeed = async () => {
        if (!isAdmin) return;
        if (window.confirm("¿Crear estructura inicial en Firebase?\nEsto creará datos de ejemplo para Envíos, Partes y Proveedores.")) {
            try {
                // @ts-ignore
                await storageService.seedDatabase();
                alert("✅ ¡Éxito! La base de datos ha sido poblada.\n\nAhora puedes ver las colecciones en tu consola de Firebase.");
                window.location.reload();
            } catch (e: any) {
                console.error(e);
                if (e.code === 'permission-denied' || e.message?.includes('permission')) {
                    alert("⛔ PERMISO DENEGADO\n\nFirebase ha bloqueado la escritura. Por favor:\n1. Ve a la consola de Firebase.\n2. Entra en la pestaña 'Reglas'.\n3. Cambia 'allow read, write: if false;' a 'if true;'.\n4. Publica los cambios e intenta de nuevo.");
                } else {
                    alert("Error al inicializar: " + (e.message || "Revisa la consola para más detalles."));
                }
            }
        }
    };

    const handleCreateSnapshot = async () => {
        const reason = prompt("Enter a name/reason for this restore point:", "Manual Checkpoint");
        if (reason) {
            const success = await storageService.createSnapshot(reason);
            if (success) {
                alert("Restore point created successfully.");
                // Refresh list
                const data = await storageService.getSnapshots();
                setSnapshots(data);
            } else {
                alert("Failed to create restore point. Storage might be full.");
            }
        }
    };

    const handleRestore = async (id: string) => {
        if (!isAdmin) {
            alert("Only Admins can restore database backups.");
            return;
        }
        if (window.confirm("⚠️ Restore this version?\n\nCurrent data will be overwritten (a safety snapshot of current data will be created first).")) {
            const success = await storageService.restoreSnapshot(id);
            if (success) alert("Database restored successfully.");
            else alert("Failed to restore.");
        }
    };

    const handleDeleteSnapshot = async (id: string) => {
        if (window.confirm("Delete this restore point?")) {
            await storageService.deleteSnapshot(id);
            // Refresh list
            const data = await storageService.getSnapshots();
            setSnapshots(data);
        }
    };

    return (
        <div className="flex-1 overflow-y-auto p-8 bg-slate-50">
            <div className="max-w-3xl mx-auto space-y-6 pb-12">
                <h1 className="text-2xl font-bold text-slate-800">System Settings</h1>

                {/* ADMIN ONLY: User Management */}
                {isAdmin && (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                    <Users className="text-blue-500" size={24} />
                                    User Management
                                </h2>
                                <p className="text-slate-500 text-sm mt-1">Manage system access and roles.</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-2.5 text-slate-400" size={16} />
                                    <input
                                        type="text"
                                        placeholder="Buscar por coma..."
                                        value={userFilter}
                                        onChange={(e) => setUserFilter(e.target.value)}
                                        className="pl-9 pr-4 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 w-56 outline-none"
                                    />
                                </div>
                                <button
                                    onClick={() => setShowUserQueryBuilder(true)}
                                    className={`p-2 rounded-lg transition-colors border ${userQueryConditions.length > 0 ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                                    title="Mass Query"
                                >
                                    <Database size={18} />
                                </button>
                                <div className="text-xs text-slate-400 font-mono hidden sm:block">
                                    Count: {filteredUsers.length} / {systemUsers?.length || 0}
                                </div>
                                <button
                                    onClick={async () => {
                                        const email = prompt("Enter new user Email:");
                                        if (!email) return;
                                        const pwd = prompt("Enter temporary Password:");
                                        if (!pwd) return;

                                        // @ts-ignore
                                        if (authService.adminCreateUser) {
                                            // @ts-ignore
                                            const success = await authService.adminCreateUser(email, pwd, UserRole.VIEWER);
                                            if (success) {
                                                alert("User created successfully as Viewer. You can now change their role.");
                                                // @ts-ignore
                                                const users = await authService.getUsers();
                                                setSystemUsers(users);
                                            } else {
                                                alert("Failed to create user. Check console.");
                                            }
                                        }
                                    }}
                                    className="p-2 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-full transition-colors border border-emerald-200"
                                    title="Manually Add User"
                                >
                                    <UserPlus size={18} />
                                </button>

                                <button
                                    onClick={async () => {
                                        // @ts-ignore
                                        const users = await authService.getUsers();
                                        console.log("Debug Users Fetched:", users);
                                        setSystemUsers(users);
                                    }}
                                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                                    title="Refresh User List"
                                >
                                    <RotateCcw size={18} />
                                </button>
                                <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2 py-1 rounded border border-blue-100 uppercase">Admin Area</span>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-500">
                                    <tr>
                                        <th className="px-6 py-3">Username</th>
                                        <th className="px-6 py-3">Name</th>
                                        <th className="px-6 py-3">Role</th>
                                        <th className="px-6 py-3">SCAC</th>
                                        <th className="px-6 py-3">Nombre Comercial</th>
                                        <th className="px-6 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredUsers?.map((u, i) => (
                                        <tr key={u.email || u.username} className="hover:bg-slate-50">
                                            <td className="px-6 py-3 font-mono text-slate-600">
                                                <span>{u.username}</span>
                                            </td>
                                            <td className="px-6 py-3 font-medium text-slate-800">
                                                <span>{u.name}</span>
                                            </td>
                                            <td className="px-6 py-3">
                                                <div className="flex items-center gap-2">
                                                    <select
                                                        value={u.role}
                                                        onChange={async (e) => {
                                                            const newRole = e.target.value as UserRole;
                                                            const selectEl = e.target;
                                                            const roleLabels: Record<string, string> = {
                                                                [UserRole.ADMIN]: 'Admin',
                                                                [UserRole.EDITOR]: 'Editor',
                                                                [UserRole.AGENT]: 'Agent',
                                                                [UserRole.OPERATOR]: 'Operator',
                                                                [UserRole.EXPO]: 'Expo',
                                                                [UserRole.CARRIER]: 'Carrier',
                                                                [UserRole.TRANSPORTISTA]: 'Transportista',
                                                                [UserRole.VIEWER]: 'Viewer',
                                                                [UserRole.HANDHELD_USER]: 'Handheld (Sellos)',
                                                                [UserRole.HANDHELD_USER2]: 'Handheld 2 (Liberación)',
                                                                [UserRole.EMBARQUES]: 'Embarques',
                                                                [UserRole.CLIENT]: 'Cliente',
                                                                [UserRole.FINANZAS]: 'Finanzas',
                                                                [UserRole.PENDING]: 'Pending',
                                                            };
                                                            const roleLabel = roleLabels[newRole] || newRole;
                                                            if (window.confirm(`¿Cambiar rol de "${u.username}" a "${roleLabel}"?`)) {
                                                                selectEl.disabled = true;
                                                                // @ts-ignore
                                                                const success = await authService.updateUserRole(u.email || u.username, newRole);
                                                                selectEl.disabled = false;
                                                                if (success) {
                                                                    alert(`✅ Rol actualizado a "${roleLabel}" correctamente.`);
                                                                    // Refresh list
                                                                    // @ts-ignore
                                                                    const updated = await authService.getUsers();
                                                                    setSystemUsers(updated);
                                                                } else {
                                                                    alert("❌ No se pudo actualizar el rol. Revisa la consola para más detalles.");
                                                                    // Reset select back to original value
                                                                    selectEl.value = u.role;
                                                                }
                                                            } else {
                                                                // User cancelled — reset select to original value
                                                                selectEl.value = u.role;
                                                            }
                                                        }}
                                                        className={`border-slate-200 rounded text-xs font-medium py-1 px-2 bg-white ${u.role === UserRole.PENDING ? 'border-amber-300 text-amber-700 bg-amber-50' : ''}`}
                                                    >
                                                        <option value={UserRole.ADMIN}>Admin</option>
                                                        <option value={UserRole.EDITOR}>Editor</option>
                                                        <option value={UserRole.AGENT}>Agent</option>
                                                        <option value={UserRole.OPERATOR}>Operator</option>
                                                        <option value={UserRole.EXPO}>Expo</option>
                                                        <option value={UserRole.CARRIER}>Carrier</option>
                                                        <option value={UserRole.TRANSPORTISTA}>Transportista</option>
                                                        <option value={UserRole.VIEWER}>Viewer</option>
                                                        <option value={UserRole.HANDHELD_USER}>Handheld (Sellos)</option>
                                                        <option value={UserRole.HANDHELD_USER2}>Handheld 2 (Liberación)</option>
                                                        <option value={UserRole.EMBARQUES}>Embarques</option>
                                                        <option value={UserRole.CLIENT}>Cliente</option>
                                                        <option value={UserRole.FINANZAS}>Finanzas</option>
                                                        <option value={UserRole.PENDING}>Pending</option>
                                                    </select>
                                                    {u.role === UserRole.PENDING && (
                                                        <span className="animate-pulse w-2 h-2 rounded-full bg-amber-500" title="Waiting for Approval"></span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-3">
                                                <input 
                                                    key={`scac-${u.email || u.username}-${u.scac || ''}`}
                                                    type="text" 
                                                    placeholder="SCAC"
                                                    defaultValue={u.scac || ''}
                                                    onBlur={async (e) => {
                                                        const newScac = e.target.value;
                                                        if ((u.scac || '') !== newScac) {
                                                            // @ts-ignore
                                                            await authService.updateUserScac(u.email || u.username, newScac);
                                                            setSystemUsers(prev => prev.map(user => 
                                                                (user.email || user.username) === (u.email || u.username) 
                                                                    ? { ...user, scac: newScac } 
                                                                    : user
                                                            ));
                                                        }
                                                    }}
                                                    className="w-24 border-slate-200 rounded text-xs font-mono py-1 px-2 bg-white outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                                />
                                            </td>
                                            <td className="px-6 py-3">
                                                <input 
                                                    key={`sublinea-${u.email || u.username}-${u.subLinea || ''}`}
                                                    type="text" 
                                                    placeholder="Nombre Comercial"
                                                    defaultValue={u.subLinea || ''}
                                                    onBlur={async (e) => {
                                                        const newSubLinea = e.target.value;
                                                        if ((u.subLinea || '') !== newSubLinea) {
                                                            // @ts-ignore
                                                            await authService.updateUserSubLinea(u.email || u.username, newSubLinea);
                                                            setSystemUsers(prev => prev.map(user => 
                                                                (user.email || user.username) === (u.email || u.username) 
                                                                    ? { ...user, subLinea: newSubLinea } 
                                                                    : user
                                                            ));
                                                        }
                                                    }}
                                                    className="w-32 border-slate-200 rounded text-xs font-mono py-1 px-2 bg-white outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                                                />
                                            </td>
                                            <td className="px-6 py-3 text-right">
                                                <div className="flex items-center justify-end gap-3">
                                                    {u.role === UserRole.PENDING ? (
                                                        <span className="text-xs text-amber-600 font-bold">Needs Approval</span>
                                                    ) : (
                                                        <span className="text-xs text-slate-400">Active</span>
                                                    )}

                                                    <button
                                                        onClick={async () => {
                                                            if (window.confirm(`Force password reset for ${u.email || u.username}?\n\nThey will be required to set a new password on their next login.`)) {
                                                                try {
                                                                    // @ts-ignore
                                                                    await authService.requestPasswordReset(u.email || u.username);
                                                                    alert("Reset requested. User must set a new password on next login.");
                                                                } catch (e) {
                                                                    alert("Failed to request reset.");
                                                                }
                                                            }
                                                        }}
                                                        className="text-slate-400 hover:text-blue-600 transition-colors p-1"
                                                        title="Force Password Reset"
                                                    >
                                                        <Key size={16} />
                                                    </button>

                                                    <button
                                                        onClick={async () => {
                                                            if (window.confirm(`Are you sure you want to DELETE user '${u.username}'? This cannot be undone.`)) {
                                                                // @ts-ignore
                                                                const success = await authService.deleteUser(u.email || u.username);
                                                                if (success) {
                                                                    // @ts-ignore
                                                                    const updated = await authService.getUsers();
                                                                    setSystemUsers(updated);
                                                                } else {
                                                                    alert("Failed to delete user.");
                                                                }
                                                            }
                                                        }}
                                                        className="text-slate-400 hover:text-red-600 transition-colors p-1"
                                                        title="Delete User"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="p-4 bg-slate-50 border-t border-slate-100 text-center text-xs text-slate-400">
                            In this demo version, user editing is simulated.
                        </div>
                    </div>
                )}

                {/* Restore Points / Versioning - Visible to All (Read Only for Non-Admins) */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <History className="text-emerald-500" size={24} />
                                Restore Points (Snapshots)
                            </h2>
                            <p className="text-slate-500 text-sm mt-1">Manage internal versions of your data. Automatically created before risky operations.</p>
                        </div>
                        {isAdmin && (
                            <button
                                onClick={handleCreateSnapshot}
                                className="flex items-center gap-2 bg-emerald-50 text-emerald-600 border border-emerald-200 px-4 py-2 rounded-lg hover:bg-emerald-100 font-medium transition-colors"
                            >
                                <Save size={16} /> Create Snapshot
                            </button>
                        )}
                    </div>

                    <div className="p-0">
                        {(snapshots?.length || 0) === 0 ? (
                            <div className="p-8 text-center text-slate-400">No restore points available. Create one to get started.</div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {snapshots?.map((snap) => (
                                    <div key={snap.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                        <div>
                                            <div className="font-medium text-slate-800">{snap.reason}</div>
                                            <div className="text-xs text-slate-500 flex gap-2 mt-1">
                                                <span>{new Date(snap.timestamp).toLocaleString()}</span>
                                                <span>•</span>
                                                <span>{snap.sizeKB} KB</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {isAdmin && (
                                                <>
                                                    <button
                                                        onClick={() => handleRestore(snap.id)}
                                                        className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                                                        title="Restore this version"
                                                    >
                                                        <RotateCcw size={18} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteSnapshot(snap.id)}
                                                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                                        title="Delete snapshot"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="bg-slate-50 p-3 text-xs text-center text-slate-400 border-t border-slate-100">
                        System keeps up to 5 snapshots automatically to manage storage space.
                    </div>
                </div>

                {/* AUDIT REPORT SUBSCRIPTIONS */}
                {isAdmin && (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                    <Mail className="text-blue-500" size={24} />
                                    Suscripciones a Reporte Diario
                                </h2>
                                <p className="text-slate-500 text-sm mt-1">Configura quién recibirá el reporte de Master Data todas las noches a la 1:00 AM.</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-2.5 text-slate-400" size={16} />
                                    <input
                                        type="text"
                                        placeholder="Buscar por coma..."
                                        value={emailFilter}
                                        onChange={(e) => setEmailFilter(e.target.value)}
                                        className="pl-9 pr-4 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 w-56 outline-none"
                                    />
                                </div>
                                <button
                                    onClick={() => setShowEmailQueryBuilder(true)}
                                    className={`p-2 rounded-lg transition-colors border ${emailQueryConditions.length > 0 ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                                    title="Mass Query"
                                >
                                    <Database size={18} />
                                </button>
                            </div>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="flex gap-2">
                                <input
                                    type="email"
                                    value={newEmail}
                                    onChange={(e) => setNewEmail(e.target.value)}
                                    placeholder="ejemplo@correo.com"
                                    className="flex-1 border-slate-200 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                                <button
                                    onClick={async () => {
                                        const trimmedEmail = newEmail.trim().toLowerCase();
                                        if (!trimmedEmail.match(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)) {
                                            alert("Email inválido. Por favor revisa el formato.");
                                            return;
                                        }
                                        if (reportEmails.includes(trimmedEmail)) {
                                            alert("Este correo ya está en la lista.");
                                            return;
                                        }
                                        const newList = [...reportEmails, trimmedEmail];
                                        // @ts-ignore
                                        const success = await storageService.updateAuditReportEmails(newList);
                                        if (success) {
                                            setReportEmails(newList);
                                            setNewEmail('');
                                        }
                                    }}
                                    className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors font-bold text-sm"
                                >
                                    <Plus size={16} /> [ Agregar ]
                                </button>
                            </div>

                            <div className="space-y-2">
                                {(filteredEmails?.length || 0) === 0 ? (
                                    <p className="text-slate-400 text-sm italic py-4 text-center">No hay correos registrados o que coincidan con la búsqueda.</p>
                                ) : (
                                    filteredEmails?.map((email, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold uppercase">
                                                    {email.charAt(0)}
                                                </div>
                                                <span className="text-sm font-medium text-slate-700">{email}</span>
                                            </div>
                                            <button
                                                onClick={async () => {
                                                    if (window.confirm(`¿Quitar ${email} de la lista?`)) {
                                                        const newList = reportEmails.filter(e => e !== email);
                                                        // @ts-ignore
                                                        const success = await storageService.updateAuditReportEmails(newList);
                                                        if (success) setReportEmails(newList);
                                                    }
                                                }}
                                                className="text-slate-400 hover:text-red-500 p-1 transition-colors"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Local Storage Management */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <Database className="text-slate-500" size={24} />
                                Data Management
                            </h2>
                            <p className="text-slate-500 text-sm mt-1">Manage the data stored in your browser's Local Storage.</p>
                        </div>
                    </div>

                    <div className="p-6">
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="text-amber-600 shrink-0" size={20} />
                                <div>
                                    <h3 className="font-medium text-amber-900">Storage Mode Active</h3>
                                    <p className="text-sm text-amber-800 mt-1">
                                        This application is using {storageService.isCloudMode() ? 'Firebase Cloud Storage' : 'Browser Local Storage'}.
                                        {!storageService.isCloudMode() && " Clearing your browser cache may delete your data. Please use the 'Backup' button in the Database view regularly."}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Admin Only Actions for Data Reset/Seed */}
                        {isAdmin && (
                            <div className="border-t border-slate-100 pt-6">
                                <h3 className="text-md font-bold text-slate-700 mb-4">Setup & Reset</h3>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between bg-blue-50 p-4 rounded-lg border border-blue-100">
                                        <div className="pr-4">
                                            <p className="font-medium text-blue-800">Initialize / Seed Database</p>
                                            <p className="text-xs text-blue-600 mt-1">
                                                Create initial collections (Shipments, Parts, Suppliers) in Firebase. Use this if your dashboard is empty.
                                            </p>
                                        </div>
                                        <button
                                            onClick={handleSeed}
                                            className="shrink-0 flex items-center gap-2 bg-white border border-blue-200 text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-600 hover:text-white font-medium shadow-sm transition-all"
                                        >
                                            <Play size={18} />
                                            Initialize
                                        </button>
                                    </div>

                                    <div className="flex items-center justify-between bg-red-50 p-4 rounded-lg border border-red-100">
                                        <div className="pr-4">
                                            <p className="font-medium text-red-800">Factory Reset</p>
                                            <p className="text-xs text-red-600 mt-1">
                                                Deletes all Shipments, Parts, and Logs. Resets the application to its initial state.
                                            </p>
                                        </div>
                                        <button
                                            onClick={handleReset}
                                            className="shrink-0 flex items-center gap-2 bg-white border border-red-200 text-red-600 px-4 py-2 rounded-lg hover:bg-red-600 hover:text-white font-medium shadow-sm transition-all"
                                        >
                                            <Trash2 size={18} />
                                            Reset Data
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* User Management Query Builder */}
            <CatalogQueryBuilder
                isOpen={showUserQueryBuilder}
                onClose={() => setShowUserQueryBuilder(false)}
                columns={['username', 'name', 'role', 'scac', 'subLinea']}
                conditions={userQueryConditions}
                setConditions={setUserQueryConditions}
                onApply={() => setShowUserQueryBuilder(false)}
                onClear={() => {
                    setUserQueryConditions([]);
                    setShowUserQueryBuilder(false);
                }}
            />

            {/* Email Report Query Builder */}
            <CatalogQueryBuilder
                isOpen={showEmailQueryBuilder}
                onClose={() => setShowEmailQueryBuilder(false)}
                columns={['email']}
                conditions={emailQueryConditions}
                setConditions={setEmailQueryConditions}
                onApply={() => setShowEmailQueryBuilder(false)}
                onClear={() => {
                    setEmailQueryConditions([]);
                    setShowEmailQueryBuilder(false);
                }}
            />
        </div>
    );
};