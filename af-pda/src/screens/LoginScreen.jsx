import React, { useState } from 'react';
import { Lock, LogIn, Ship, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, getDocFromCache, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase.js';
import { useLang } from '../i18n.jsx';
import { login as apiLogin } from '../api.js';

const ROOT_ADMIN_EMAIL = 'admin@logimaster.com';

// Replica exacta de authService.login() del webapp principal
const doLogin = async (email, password) => {
    const cleanEmail    = (email || '').trim().toLowerCase();
    const cleanPassword = (password || '').trim();
    const isRootAdmin   = cleanEmail === ROOT_ADMIN_EMAIL;

    // 1. Leer de caché local primero (igual que authService.ts)
    let userSnap;
    try {
        userSnap = await getDocFromCache(doc(db, 'users', cleanEmail));
    } catch {
        try {
            userSnap = await getDoc(doc(db, 'users', cleanEmail));
        } catch (netErr) {
            await new Promise(r => setTimeout(r, 2000));
            userSnap = await getDoc(doc(db, 'users', cleanEmail));
        }
    }

    if (!userSnap.exists()) {
        throw { code: 'auth/user-not-found', message: 'User not registered.' };
    }

    const data = userSnap.data();

    // 2. Validación híbrida — idéntica a authService.ts
    if (isRootAdmin && cleanPassword === '1234') {
        signInWithEmailAndPassword(auth, cleanEmail, cleanPassword).catch(() => {});
    } else if (data.password && data.password === cleanPassword) {
        signInWithEmailAndPassword(auth, cleanEmail, cleanPassword)
            .catch((e) => {
                if (e.code === 'auth/user-not-found') {
                    createUserWithEmailAndPassword(auth, cleanEmail, cleanPassword).catch(() => {});
                }
            });
    } else {
        try {
            await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
        } catch (e) {
            if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') throw e;
            if (e.code === 'auth/user-not-found') {
                const newCred = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPassword);
                updateDoc(doc(db, 'users', cleanEmail), { password: cleanPassword }).catch(() => {});
            } else {
                if (data.password) throw { code: 'auth/wrong-password', message: 'Contraseña incorrecta.' };
                else throw { code: 'auth/network-request-failed', message: 'Se requiere conexión a internet.' };
            }
        }
    }

    // 3. Construir el objeto de usuario — igual que authService.ts
    const role = isRootAdmin ? 'ADMIN' : (data.role || 'HANDHELD_USER');
    const user = {
        username:        data.username || cleanEmail.split('@')[0],
        name:            data.name || data.username || cleanEmail.split('@')[0],
        email:           cleanEmail,
        role,
        location:        data.assigned_location || data.location || 'L1',
        avatarInitials:  cleanEmail.substring(0, 2).toUpperCase(),
    };

    // 4. Guardar en localStorage con la MISMA key que el webapp principal
    localStorage.setItem('logimaster_user', JSON.stringify(user));

    // 5. Get Custom JWT for PDA REST API backwards compatibility
    try {
        const backendAuth = await apiLogin(cleanEmail, cleanPassword);
        if (backendAuth && backendAuth.token) {
            sessionStorage.setItem('wms_jwt', backendAuth.token);
        }
    } catch (apiErr) {
        console.warn("Backend JWT login failed:", apiErr);
    }

    return user;
};

export default function LoginScreen() {
    const { t } = useLang();
    const [email, setEmail]       = useState('');
    const [password, setPassword] = useState('');
    const [error, setError]       = useState('');
    const [loading, setLoading]   = useState(false);
    const navigate                = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const loggedInUser = await doLogin(email, password);
            if (loggedInUser && (loggedInUser.role === 'ADMIN' || loggedInUser.role === 'HANDHELD_AF')) {
                navigate('/activos-fijos');
            } else {
                setError('Acceso denegado: Se requiere rol de Activos Fijos.');
            }
        } catch (err) {
            if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
                setError('Contraseña incorrecta.');
            } else if (err.code === 'auth/user-not-found') {
                setError('Usuario no registrado.');
            } else if (err.code === 'auth/too-many-requests') {
                setError('Demasiados intentos. Espera unos minutos.');
            } else if (err.code === 'auth/network-request-failed') {
                setError(err.message || 'Sin conexión a internet.');
            } else {
                setError('Error de autenticación. ' + (err.message || ''));
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600 rounded-full blur-[100px]"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-emerald-600 rounded-full blur-[100px]"></div>
            </div>

            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative z-10">
                <div className="p-8 pb-6 text-center border-b border-slate-100 bg-slate-50">
                    <div className="mx-auto w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg mb-4 transform -rotate-6">
                        <Ship size={32} />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-800 tracking-tight">{t('login_title')}</h1>
                    <p className="text-slate-500 text-sm mt-1">{t('login_subtitle')}</p>
                </div>

                <form onSubmit={handleLogin} className="p-8 space-y-5">
                    {error && (
                        <div className="text-sm p-3 rounded-lg border text-center font-medium bg-red-50 text-red-600 border-red-100">
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('login_email')}</label>
                        <div className="relative">
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full pl-4 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-medium"
                                placeholder="name@company.com"
                                required
                                autoComplete="email"
                                inputMode="email"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('login_password')}</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-3 text-slate-400" size={18} />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-medium"
                                placeholder="••••••••"
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className={`w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-md transition-all flex items-center justify-center gap-2 ${loading ? 'opacity-70 cursor-wait' : ''}`}
                    >
                        {loading ? <><Loader2 size={18} className="animate-spin" /> {t('login_loading')}</> : <><LogIn size={18} /> {t('login_btn')}</>}
                    </button>

                    <div className="text-center pt-2">
                        <span className="text-sm text-slate-400">{t('login_register')}</span>
                    </div>
                </form>

                <div className="bg-slate-50 p-4 text-center text-[10px] text-slate-400 border-t border-slate-100 flex justify-between items-center px-6">
                    <span>{t('login_footer')}</span>
                    <span className="font-mono opacity-50">v1.2.1-PERF</span>
                </div>
            </div>
        </div>
    );
}
