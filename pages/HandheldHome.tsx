import React from 'react';
import { useAuth } from '../context/useAuth';
import { LogOut, ShieldCheck, Box, DoorOpen, Truck, Anchor, Shield, Monitor, LayoutList } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { UserRole } from '../types.ts';

export const HandheldHome = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-slate-900 flex flex-col p-6 relative overflow-hidden text-center">
            <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600 rounded-full blur-[100px]"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-emerald-600 rounded-full blur-[100px]"></div>
            </div>

            <div className="flex-1 w-full max-w-sm mx-auto relative z-10 flex flex-col gap-6 pt-8">
                
                <div className="flex items-center gap-4 bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50 backdrop-blur-sm">
                   <div className="w-14 h-14 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-full flex items-center justify-center">
                       <ShieldCheck size={28} />
                   </div>
                   <div className="text-left">
                       <p className="text-slate-400 text-sm font-medium">Operario</p>
                       <h1 className="text-xl font-bold text-white tracking-tight">{user?.name || user?.username}</h1>
                   </div>
                </div>

                <div className="grid grid-cols-1 gap-4 mt-4">
                                        {/* Asignaciones Diarias 53' */}
                     {user?.role !== UserRole.HANDHELD_AF && (
                         <button
                            onClick={() => navigate('/m/asignaciones')}
                            className="bg-slate-800 hover:bg-slate-700 border border-slate-700 p-6 rounded-[24px] shadow-lg flex items-center gap-5 transition-transform active:scale-95 text-left group"
                         >
                            <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-[0_0_20px_rgba(5,150,105,0.3)] group-hover:scale-105 transition-transform">
                               <LayoutList size={32} />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white tracking-tight">Asignación 53' Cajas Secas</h2>
                                <p className="text-slate-400 text-sm mt-1 font-medium">Vista operativa del día</p>
                            </div>
                         </button>
                     )}

                     {/* Registro de Arribo */}
                     {user?.role !== UserRole.HANDHELD_AF && (
                         <button
                            onClick={() => navigate('/m/arribo')}
                            className="bg-slate-800 hover:bg-slate-700 border border-slate-700 p-6 rounded-[24px] shadow-lg flex items-center gap-5 transition-transform active:scale-95 text-left group"
                         >
                            <div className="w-16 h-16 bg-amber-500 rounded-2xl flex items-center justify-center text-white shadow-[0_0_20px_rgba(245,158,11,0.3)] group-hover:scale-105 transition-transform">
                               <Truck size={32} />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white tracking-tight">Registro de Arribo</h2>
                                <p className="text-slate-400 text-sm mt-1 font-medium">Hora y comentarios de llegada</p>
                            </div>
                         </button>
                     )}

                    {/* Cajas y Sellos */}
                    {user?.role !== UserRole.HANDHELD_USER2 && user?.role !== UserRole.HANDHELD_AF && (
                        <button 
                           onClick={() => navigate('/m/sellos')}
                           className="bg-slate-800 hover:bg-slate-700 border border-slate-700 p-6 rounded-[24px] shadow-lg flex items-center gap-5 transition-transform active:scale-95 text-left group"
                        >
                           <div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center text-white shadow-[0_0_20px_rgba(59,130,246,0.3)] group-hover:scale-105 transition-transform">
                              <Box size={32} />
                           </div>
                           <div>
                               <h2 className="text-lg font-bold text-white tracking-tight">Cajas y Sellos</h2>
                               <p className="text-slate-400 text-sm mt-1 font-medium">Asignar Número con IA</p>
                           </div>
                        </button>
                    )}

                    {/* Liberación de Dock — Fotos 1 y 2 */}
                    {user?.role !== UserRole.HANDHELD_AF && (
                        <button
                           onClick={() => navigate('/m/liberacion-dock')}
                           className="bg-slate-800 hover:bg-slate-700 border border-slate-700 p-6 rounded-[24px] shadow-lg flex items-center gap-5 transition-transform active:scale-95 text-left group"
                        >
                           <div className="w-16 h-16 bg-sky-500 rounded-2xl flex items-center justify-center text-white shadow-[0_0_20px_rgba(14,165,233,0.3)] group-hover:scale-105 transition-transform">
                              <Anchor size={32} />
                           </div>
                           <div>
                               <h2 className="text-lg font-bold text-white tracking-tight">Liberación de Dock</h2>
                               <p className="text-slate-400 text-sm mt-1 font-medium">Foto Caja Cargada y Puertas</p>
                           </div>
                        </button>
                    )}

                    {/* Liberación de Caja — Solo Sello */}
                    {user?.role !== UserRole.HANDHELD_AF && (
                        <button
                           onClick={() => navigate('/m/liberacion')}
                           className="bg-slate-800 hover:bg-slate-700 border border-slate-700 p-6 rounded-[24px] shadow-lg flex items-center gap-5 transition-transform active:scale-95 text-left group"
                        >
                           <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-[0_0_20px_rgba(16,185,129,0.3)] group-hover:scale-105 transition-transform">
                              <DoorOpen size={32} />
                           </div>
                           <div>
                               <h2 className="text-lg font-bold text-white tracking-tight">Liberación de Caja</h2>
                               <p className="text-slate-400 text-sm mt-1 font-medium">Cierre Definitivo — Sello</p>
                           </div>
                        </button>
                    )}

                    {/* Vigilancia — Inspección 7 puntos + Placas */}
                    {user?.role !== UserRole.HANDHELD_AF && (
                        <button
                           onClick={() => navigate('/m/vigilancia')}
                           className="bg-slate-800 hover:bg-slate-700 border border-slate-700 p-6 rounded-[24px] shadow-lg flex items-center gap-5 transition-transform active:scale-95 text-left group"
                        >
                           <div className="w-16 h-16 bg-red-600 rounded-2xl flex items-center justify-center text-white shadow-[0_0_20px_rgba(239,68,68,0.3)] group-hover:scale-105 transition-transform">
                              <Shield size={32} />
                           </div>
                           <div>
                               <h2 className="text-lg font-bold text-white tracking-tight">Vigilancia</h2>
                               <p className="text-slate-400 text-sm mt-1 font-medium">Inspección 7 puntos + Placas</p>
                           </div>
                        </button>
                    )}

                </div>

                <div className="w-full mt-auto mb-4 flex flex-col gap-3">
                    <button 
                        onClick={() => logout()}
                        className="w-full h-[56px] bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded-2xl font-bold shadow-lg transition-all flex items-center justify-center gap-3 text-lg"
                    >
                        <LogOut size={22} className="text-slate-400" />
                        Cerrar Sesión
                    </button>
                </div>
            </div>
        </div>
    );
};
