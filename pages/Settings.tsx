import React, { useEffect, useState } from 'react';
import { storageService } from '../services/storageService.ts';
import { Database, Trash2, AlertTriangle, History, RotateCcw, Save, Users, Shield, Play, Key, UserPlus } from 'lucide-react';
import { RestorePoint, UserRole, User } from '../types.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { authService } from '../services/authService.ts';

export const Settings = () => {
    const { hasRole, user } = useAuth();
    const isAdmin = hasRole([UserRole.ADMIN]);

    const [snapshots, setSnapshots] = useState<RestorePoint[]>([]);
    const [systemUsers, setSystemUsers] = useState<User[]>([]);

    useEffect(() => {
        // Initial load
        setSnapshots(storageService.getSnapshots());

        // Only fetch users if Admin
        if (isAdmin) {
            // @ts-ignore
            authService.getUsers().then(users => setSystemUsers(users));
        }

        // Subscribe to changes (e.g. if auto-backup runs)
        const unsub = storageService.subscribe(() => {
            setSnapshots(storageService.getSnapshots());
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

    const handleCreateSnapshot = () => {
        const reason = prompt("Enter a name/reason for this restore point:", "Manual Checkpoint");
        if (reason) {
            const success = storageService.createSnapshot(reason);
            if (success) {
                alert("Restore point created successfully.");
            } else {
                alert("Failed to create restore point. Storage might be full.");
            }
        }
    };

    const handleRestore = (id: string) => {
        if (!isAdmin) {
            alert("Only Admins can restore database backups.");
            return;
        }
        if (window.confirm("⚠️ Restore this version?\n\nCurrent data will be overwritten (a safety snapshot of current data will be created first).")) {
            const success = storageService.restoreSnapshot(id);
            if (success) alert("Database restored successfully.");
            else alert("Failed to restore.");
        }
    };

    const handleDeleteSnapshot = (id: string) => {
        if (window.confirm("Delete this restore point?")) {
            storageService.deleteSnapshot(id);
        }
    };

    return (
        <div className="max-w-3xl mx-auto space-y-6">
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
                            <div className="text-xs text-slate-400 font-mono">
                                Count: {systemUsers.length}
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
                                    <th className="px-6 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {systemUsers.map((u, i) => (
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
                                                        if (window.confirm(`Change role of ${u.username} to ${newRole}?`)) {
                                                            // @ts-ignore
                                                            const success = await authService.updateUserRole(u.email || u.username, newRole); // Use email (doc ID) if available
                                                            if (success) {
                                                                alert("Role updated!");
                                                                // Refresh list
                                                                // @ts-ignore
                                                                const updated = await authService.getUsers();
                                                                setSystemUsers(updated);
                                                            } else {
                                                                alert("Failed to update role.");
                                                            }
                                                        }
                                                    }}
                                                    className={`border-slate-200 rounded text-xs font-medium py-1 px-2 bg-white ${u.role === UserRole.PENDING ? 'border-amber-300 text-amber-700 bg-amber-50' : ''}`}
                                                >
                                                    <option value={UserRole.ADMIN}>Admin</option>
                                                    <option value={UserRole.EDITOR}>Editor</option>
                                                    <option value={UserRole.OPERATOR}>Operator</option>
                                                    <option value={UserRole.VIEWER}>Viewer</option>
                                                    <option value={UserRole.PENDING}>Pending</option>
                                                </select>
                                                {u.role === UserRole.PENDING && (
                                                    <span className="animate-pulse w-2 h-2 rounded-full bg-amber-500" title="Waiting for Approval"></span>
                                                )}
                                            </div>
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
                    {snapshots.length === 0 ? (
                        <div className="p-8 text-center text-slate-400">No restore points available. Create one to get started.</div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {snapshots.map((snap) => (
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
    );
}