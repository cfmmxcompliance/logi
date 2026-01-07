
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { authService } from '../services/authService.ts';
import { Lock, User as UserIcon, LogIn, Ship, UserPlus, Key } from 'lucide-react';

export const Login = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const [isResetMode, setIsResetMode] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isResetMode) {
        // Handle Password Reset Confirmation
        // @ts-ignore
        const success = await authService.confirmPasswordReset(username, password);
        if (success) {
          // Auto login with new password
          const user = await authService.login(username, password);
          if (user) login(user);
        } else {
          setError("Failed to update password.");
        }
        return;
      }

      let user;
      if (isLogin) {
        user = await authService.login(username, password);
      } else {
        user = await authService.register(username, password);
      }

      if (user) {
        login(user); // Auto-login after register
      } else {
        setError('Authentication failed.');
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/new-password-required') {
        setIsResetMode(true);
        setPassword(''); // Clear old password
        setError('Admin requested password reset. Please enter a new password.');
        return; // Stop here, let UI render reset mode
      }

      if (err.code === 'auth/invalid-credential') {
        setError('Invalid email or password.');
      } else if (err.code === 'auth/user-not-found') {
        // Only show popup for Login mode. Registration handles new users.
        if (isLogin) {
          window.alert("User not registered / Usuario no registrado");
        }
        setError('User not registered.');
      } else if (err.code === 'auth/wrong-password') {
        setError('Invalid email or password.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('Email already registered. Please login.');
      } else if (err.code === 'auth/network-request-failed' || err.code === 'unavailable') {
        window.alert("Connection Failed: Cannot validate user security. / Sin conexión: No se puede validar usuario.");
        setError('Network error. Cannot validate user.');
      } else if (err.code === 'auth/role-pending') {
        // Explicit requirement: Pop-up for pending users
        window.alert("Access Denied: Role not assigned. Please contact Admin. / Acceso Denegado: Solicita soporte de Admin");
        setError('Access Denied. Contact Admin.');
      } else if (err.code === 'auth/signup-success-pending') {
        window.alert("Account created successfully. Please wait for an Administrator to assign you a role.");
        setError('Account pending approval.');
        setIsLogin(true); // Switch back to login
      } else {
        setError('Authentication error. ' + (err.message || ''));
      }
      localStorage.removeItem('logimaster_user'); // Ensure clean state
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden">

      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-emerald-600 rounded-full blur-[100px]"></div>
      </div>

      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative z-10">
        <div className="p-8 pb-6 text-center border-b border-slate-100 bg-slate-50">
          <div className="mx-auto w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg mb-4 transform -rotate-6">
            <Ship size={32} />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">LogiMaster CFMoto</h1>
          <p className="text-slate-500 text-sm mt-1">Import/Export Operations Control</p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          {error && (
            <div className={`text-sm p-3 rounded-lg border text-center font-medium animate-pulse ${isResetMode ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Email Address</label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-3 text-slate-400" size={18} />
              <input
                type="email"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-medium disabled:opacity-50"
                placeholder="name@company.com"
                required
                disabled={isResetMode}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              {isResetMode ? "New Password" : "Password"}
            </label>
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
            {loading ? 'Processing...' : (
              isResetMode ? <><Key size={18} /> Set New Password</> :
                (isLogin ? <><LogIn size={18} /> Sign In</> : <><UserPlus size={18} /> Create Account</>)
            )}
          </button>

          {!isResetMode && (
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => { setIsLogin(!isLogin); setError(''); }}
                className="text-sm text-slate-500 hover:text-blue-600 font-medium transition-colors"
              >
                {isLogin ? "Need an account? Register" : "Already have an account? Login"}
              </button>
            </div>
          )}
        </form>

        <div className="bg-slate-50 p-4 text-center text-xs text-slate-400 border-t border-slate-100">
          Protected System • Authorized Personnel Only
        </div>
      </div>
    </div>
  );
};
