
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { authService } from '../services/authService.ts';
import { Lock, User as UserIcon, LogIn, Ship, UserPlus } from 'lucide-react';

export const Login = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let user;
      if (isLogin) {
          user = await authService.login(username, password);
      } else {
          user = await authService.register(username, password);
      }
      
      if (user) {
        login(user);
      } else {
        setError('Authentication failed.');
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found') {
          setError('Invalid email or password.');
      } else if (err.code === 'auth/email-already-in-use') {
          setError('Email already in use.');
      } else if (err.code === 'auth/weak-password') {
          setError('Password should be at least 6 characters.');
      } else {
          setError('Authentication error. Check console.');
      }
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
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg border border-red-100 text-center font-medium animate-pulse">
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
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-medium"
                placeholder="name@company.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Password</label>
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
                isLogin ? <><LogIn size={18} /> Sign In</> : <><UserPlus size={18} /> Create Account</>
            )}
          </button>
          
          <div className="text-center pt-2">
              <button 
                type="button"
                onClick={() => { setIsLogin(!isLogin); setError(''); }}
                className="text-sm text-slate-500 hover:text-blue-600 font-medium transition-colors"
              >
                  {isLogin ? "Need an account? Register" : "Already have an account? Login"}
              </button>
          </div>
        </form>

        <div className="bg-slate-50 p-4 text-center text-xs text-slate-400 border-t border-slate-100">
           Protected System • Authorized Personnel Only
        </div>
      </div>
    </div>
  );
};
