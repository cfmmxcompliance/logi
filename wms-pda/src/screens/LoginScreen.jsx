import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../api.js';
import { LogIn, User, Lock, Ship } from 'lucide-react';

export default function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        if (!email || !password) {
            setError('Please enter email and password');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const data = await login(email, password);
            sessionStorage.setItem('wms_jwt', data.token);
            sessionStorage.setItem('wms_user', JSON.stringify(data.user));
            sessionStorage.setItem('wms_login_time', Date.now().toString());
            navigate('/home');
        } catch (err) {
            console.error("Login error:", err);
            setError(err.response?.data?.error || 'Contraseña incorrecta.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-[#1e293b]">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
                
                {/* Header */}
                <div className="pt-10 pb-6 px-8 flex flex-col items-center border-b border-slate-100">
                    <div className="bg-[#2563eb] p-3 rounded-2xl shadow-lg shadow-blue-500/30 mb-5">
                        <Ship size={40} className="text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-800 mb-1">LogiMaster CFMoto</h1>
                    <p className="text-slate-500 text-sm">Import/Export Operations Control</p>
                </div>

                {/* Form */}
                <div className="px-8 py-8">
                    {error && <div className="bg-red-50 text-red-500 border border-red-100 p-3 rounded-lg mb-6 text-sm font-semibold text-center">{error}</div>}
                    
                    <form onSubmit={handleLogin} className="space-y-5">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-2 tracking-wide uppercase">Email Address</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <User size={18} className="text-slate-400" />
                                </div>
                                <input 
                                    type="email" 
                                    placeholder="name@company.com" 
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-white border border-slate-200 text-slate-800 text-base py-3 pl-10 pr-4 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder-slate-400 transition-shadow"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-2 tracking-wide uppercase">Password</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Lock size={18} className="text-slate-400" />
                                </div>
                                <input 
                                    type="password" 
                                    placeholder="••••••••" 
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-white border border-slate-200 text-slate-800 text-base py-3 pl-10 pr-4 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder-slate-400 transition-shadow"
                                />
                            </div>
                        </div>

                        <button 
                            type="submit"
                            disabled={loading || !email || !password}
                            className="w-full bg-[#2563eb] hover:bg-blue-600 active:bg-blue-700 disabled:bg-blue-400 text-white text-base font-semibold py-3.5 rounded-xl shadow-md flex items-center justify-center gap-2 mt-4 transition-colors"
                        >
                            {loading ? 'Signing In...' : <><LogIn size={20} /> Sign In</>}
                        </button>
                    </form>

                    <div className="mt-8 text-center">
                        <button className="text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors">
                            Need an account? Register
                        </button>
                    </div>
                </div>

                {/* Footer */}
                <div className="bg-slate-50 px-8 py-4 flex justify-between items-center border-t border-slate-100">
                    <span className="text-xs text-slate-400">Protected System • Authorized Only</span>
                    <span className="text-xs text-slate-300">v1.2.1-PERF</span>
                </div>

            </div>
        </div>
    );
}
